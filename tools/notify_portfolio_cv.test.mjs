import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import {
  APPROVED_PDFS, changedApprovedPaths, notifyIfEligible, requestRebuild,
  shouldNotify,
} from './notify_portfolio_cv.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const script = join(root, 'tools/notify_portfolio_cv.mjs');
const context = {
  eventName: 'push', ref: 'refs/heads/master', repository: 'finmagnat/Resume',
  changedPaths: [APPROVED_PDFS[0]],
};
// An intentionally non-functional fixture, never sent over the network.
const fixtureHook = 'https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/' + 'unit-test-only';
globalThis.fetch = () => { throw new Error('Network is forbidden in offline tests.'); };

test('workflow YAML: exact event, branch, paths and minimal permissions', () => {
  const document = parseDocument(readFileSync(join(root, '.github/workflows/notify-portfolio-cv.yml'), 'utf8'), {
    version: '1.2', uniqueKeys: true,
  });
  assert.deepEqual(document.errors, []);
  const workflow = document.toJS();
  assert.deepEqual(workflow.on, { push: { branches: ['master'], paths: [...APPROVED_PDFS] } });
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(workflow.concurrency, { group: 'notify-portfolio-cv', 'cancel-in-progress': false });
  assert.deepEqual(Object.keys(workflow.jobs), ['notify']);
  const job = workflow.jobs.notify;
  assert.equal(job.if, "github.event_name == 'push' && github.ref == 'refs/heads/master' && github.repository == 'finmagnat/Resume'");
  assert.equal(job['runs-on'], 'ubuntu-latest');
  assert.equal(job['timeout-minutes'], 5);
  assert.equal(job.steps.length, 3);
  const [checkout, node, request] = job.steps;
  assert.equal(checkout.uses, 'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803');
  assert.deepEqual(checkout.with, { 'fetch-depth': 0, 'persist-credentials': false });
  assert.equal(node.uses, 'actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38');
  assert.deepEqual(node.with, { 'node-version': 24 });
  assert.equal(checkout.env, undefined);
  assert.equal(node.env, undefined);
  assert.equal(job.env, undefined);
  assert.equal(workflow.env, undefined);
  assert.deepEqual(request.env, { CLOUDFLARE_DEPLOY_HOOK: '${{ secrets.CLOUDFLARE_DEPLOY_HOOK }}' });
  assert.equal(request.run, 'node tools/notify_portfolio_cv.mjs');
});

for (const path of APPROVED_PDFS) {
  test(`eligible approved PDF: ${path}`, () => {
    assert.equal(shouldNotify({ ...context, changedPaths: [path] }), true);
  });
}

for (const [name, patch] of [
  ['develop', { ref: 'refs/heads/develop' }],
  ['tag', { ref: 'refs/tags/v1' }],
  ['pull request', { eventName: 'pull_request' }],
  ['manual dispatch', { eventName: 'workflow_dispatch' }],
  ['another repository', { repository: 'someone/Resume' }],
  ['deleted branch', { deleted: true }],
  ['README only', { changedPaths: ['README.md'] }],
  ['DOCX only', { changedPaths: [APPROVED_PDFS[0].replace('.pdf', '.docx')] }],
  ['additional EN variant', { changedPaths: ['Releases/EN/Yuriy_Kobylyatskiy_Unity_Developer_EN.pdf'] }],
  ['no files', { changedPaths: [] }],
]) {
  test(`skip ${name}, even without secret; never call transport`, async () => {
    let calls = 0;
    assert.deepEqual(await notifyIfEligible({ ...context, ...patch }, undefined, {
      fetchImpl: () => { calls++; throw new Error('must not run'); },
    }), { requested: false });
    assert.equal(calls, 0);
  });
}

test('missing secret fails before transport', async () => {
  for (const secret of [undefined, '', '  ']) {
    await assert.rejects(notifyIfEligible(context, secret), /is missing/);
  }
});

test('malformed or non-Cloudflare hook fails before transport without leaking value', async () => {
  for (const value of [
    'not-a-url', fixtureHook.replace('https:', 'http:'), fixtureHook.replace('api.cloudflare.com', 'evil.example'),
    `${fixtureHook}?secret=value`, `${fixtureHook}#value`, ` ${fixtureHook}`,
    fixtureHook.replace('api.cloudflare.com', 'user:password@api.cloudflare.com'),
    fixtureHook.replace('api.cloudflare.com', 'api.cloudflare.com:8443'),
    fixtureHook.replace('/deploy_hooks/', '/other/'),
  ]) {
    await assert.rejects(requestRebuild(value), error => {
      assert.match(error.message, /invalid format/);
      assert.equal(error.message.includes(value), false);
      return true;
    });
  }
});

for (const status of [200, 201, 202, 204, 299]) {
  test(`HTTP ${status}: one POST, no credentials in payload, redirects disabled`, async () => {
    const calls = [];
    const result = await notifyIfEligible(context, fixtureHook, {
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return new Response(null, { status });
      },
    });
    assert.deepEqual(result, { requested: true, status });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, fixtureHook);
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.redirect, 'error');
    assert.ok(calls[0].options.signal instanceof AbortSignal);
    assert.equal(calls[0].options.body, undefined);
    assert.equal(calls[0].options.headers, undefined);
  });
}

for (const status of [301, 400, 401, 403, 429, 500, 503]) {
  test(`HTTP ${status}: failure without retry or response-body leak`, async () => {
    let calls = 0;
    await assert.rejects(requestRebuild(fixtureHook, {
      fetchImpl: async () => { calls++; return new Response(fixtureHook, { status }); },
    }), error => {
      assert.match(error.message, /non-success/);
      assert.equal(error.message.includes(fixtureHook), false);
      return true;
    });
    assert.equal(calls, 1);
  });
}

test('transport exception is sanitized and never retried', async () => {
  let calls = 0;
  await assert.rejects(requestRebuild(fixtureHook, {
    fetchImpl: async () => { calls++; throw new Error(`private transport error ${fixtureHook}`); },
  }), error => {
    assert.match(error.message, /request failed/);
    assert.equal(error.message.includes(fixtureHook), false);
    assert.equal(error.cause, undefined);
    return true;
  });
  assert.equal(calls, 1);
});

test('stalled request times out and aborts', async () => {
  let signal;
  await assert.rejects(requestRebuild(fixtureHook, {
    timeoutMs: 15,
    fetchImpl: (_url, options) => { signal = options.signal; return new Promise(() => {}); },
  }), /timed out/);
  assert.equal(signal.aborted, true);
});

test('default HTTP timeout is bounded at 30 seconds', () => {
  assert.match(readFileSync(script, 'utf8'), /timeoutMs = 30_000/);
});

test('real Git multi-commit push range and CLI failure/skip paths, all offline', t => {
  const artifactRoot = join(root, '.artifacts/task012b1');
  mkdirSync(artifactRoot, { recursive: true });
  const fixture = mkdtempSync(join(artifactRoot, 'git-fixture-'));
  t.after(() => {
    assert.ok(resolve(fixture).startsWith(resolve(artifactRoot) + sep));
    rmSync(fixture, { recursive: true, force: true });
  });
  const git = (...args) => execFileSync('git', ['-c', 'user.name=Offline Test', '-c', 'user.email=offline@example.invalid', ...args], {
    cwd: fixture, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const put = (path, content) => {
    mkdirSync(dirname(join(fixture, path)), { recursive: true });
    writeFileSync(join(fixture, path), content);
  };
  const commit = message => { git('add', '.'); git('commit', '-qm', message); return git('rev-parse', 'HEAD'); };
  git('init', '-q');
  put('README.md', 'fixture');
  const before = commit('baseline');
  put(APPROVED_PDFS[0], 'offline PDF fixture only');
  commit('PDF in first commit of push');
  put('README.md', 'docs in last commit');
  const after = commit('last commit has no PDF');
  assert.deepEqual(changedApprovedPaths({ before, after, sha: after, cwd: fixture }), [APPROVED_PDFS[0]]);
  assert.throws(() => changedApprovedPaths({ before: '0'.repeat(40), after, sha: after, cwd: fixture }), /Invalid push range/);
  assert.throws(() => changedApprovedPaths({ before, after, sha: before, cwd: fixture }), /Invalid push range/);
  assert.throws(() => changedApprovedPaths({ before: 'f'.repeat(40), after, sha: after, cwd: fixture }), /Cannot verify/);

  const eventPath = join(fixture, 'push-event.json');
  writeFileSync(eventPath, JSON.stringify({ before, after, deleted: false }));
  const env = { ...process.env, GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/master',
    GITHUB_REPOSITORY: 'finmagnat/Resume', GITHUB_SHA: after, GITHUB_EVENT_PATH: eventPath };
  delete env.CLOUDFLARE_DEPLOY_HOOK;
  const run = patch => spawnSync(process.execPath, [script], {
    cwd: fixture, env: { ...env, ...patch }, encoding: 'utf8', timeout: 5000,
  });
  const missing = run({});
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /is missing/);
  const invalid = run({ CLOUDFLARE_DEPLOY_HOOK: 'invalid-private-fixture' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /invalid format/);
  assert.equal((invalid.stdout + invalid.stderr).includes('invalid-private-fixture'), false);
  const develop = run({ GITHUB_REF: 'refs/heads/develop' });
  assert.equal(develop.status, 0);
  assert.match(develop.stdout, /Skipped/);
  const corrupt = run({ GITHUB_EVENT_PATH: join(fixture, 'not-found.json') });
  assert.equal(corrupt.status, 1);
  assert.match(corrupt.stderr, /Cannot read GitHub/);

  put('README.md', 'docs-only push');
  // Keep the synthetic event payload out of the committed fixture range.
  git('add', 'README.md'); git('commit', '-qm', 'documentation only');
  const docsSha = git('rev-parse', 'HEAD');
  assert.deepEqual(changedApprovedPaths({ before: after, after: docsSha, sha: docsSha, cwd: fixture }), []);
  writeFileSync(eventPath, JSON.stringify({ before: after, after: docsSha }));
  const docs = run({ GITHUB_SHA: docsSha });
  assert.equal(docs.status, 0);
  assert.match(docs.stdout, /no approved source PDF/);
});
