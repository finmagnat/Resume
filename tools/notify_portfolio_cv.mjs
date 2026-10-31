import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const APPROVED_PDFS = Object.freeze([
  'Releases/EN/Yuriy_Kobylyatskiy_Senior_Unity_Developer_EN.pdf',
  'Releases/RU/Yuriy_Kobylyatskiy_Senior_Unity_Developer_RU.pdf',
]);

export class NotificationError extends Error {}

export function isMasterPush({ eventName, ref, repository, deleted = false }) {
  return eventName === 'push' && ref === 'refs/heads/master'
    && repository === 'finmagnat/Resume' && deleted === false;
}

export function shouldNotify(context) {
  return isMasterPush(context)
    && context.changedPaths.some(path => APPROVED_PDFS.includes(path));
}

// Use the whole push range: the Actions event payload need not contain file lists.
export function changedApprovedPaths({ before, after, sha, cwd = process.cwd() }) {
  const validSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
    && value !== '0'.repeat(40);
  if (!validSha(before) || !validSha(after) || after !== sha) {
    throw new NotificationError('Invalid push range; no deployment requested.');
  }
  try {
    return execFileSync('git', [
      'diff', '--name-only', '-z', '--no-renames', before, after, '--', ...APPROVED_PDFS,
    ], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000 })
      .split('\0').filter(Boolean);
  } catch {
    throw new NotificationError('Cannot verify changed PDF paths; no deployment requested.');
  }
}

function checkedHook(secret) {
  if (typeof secret !== 'string' || !secret.trim()) {
    throw new NotificationError('CLOUDFLARE_DEPLOY_HOOK is missing; no deployment requested.');
  }
  try {
    const url = new URL(secret);
    if (secret !== secret.trim() || url.protocol !== 'https:'
      || url.hostname !== 'api.cloudflare.com' || url.port || url.username || url.password
      || url.search || url.hash
      || !/^\/client\/v4\/pages\/webhooks\/deploy_hooks\/[A-Za-z0-9_-]+$/.test(url.pathname)) {
      throw new Error();
    }
  } catch {
    throw new NotificationError('CLOUDFLARE_DEPLOY_HOOK has an invalid format; no deployment requested.');
  }
  return secret;
}

export async function requestRebuild(secret, { fetchImpl = fetch, timeoutMs = 30_000 } = {}) {
  const hook = checkedHook(secret);
  const controller = new AbortController();
  let timer;
  try {
    const response = await Promise.race([
      Promise.resolve().then(() => fetchImpl(hook, {
        method: 'POST', redirect: 'error', signal: controller.signal,
      })),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new NotificationError('Deploy Hook timed out; check Cloudflare before retrying.'));
        }, timeoutMs);
      }),
    ]);
    // Never log or parse a response body: it may contain sensitive diagnostics.
    response.body?.cancel().catch(() => {});
    if (!Number.isInteger(response.status) || response.status < 200 || response.status >= 300) {
      throw new NotificationError('Deploy Hook returned a non-success response; check Cloudflare.');
    }
    return response.status;
  } catch (error) {
    if (error instanceof NotificationError) throw error;
    // Transport errors can embed the secret URL. Do not print them or their causes.
    throw new NotificationError('Deploy Hook request failed; check Cloudflare before retrying.');
  } finally {
    clearTimeout(timer);
  }
}

export async function notifyIfEligible(context, secret, options) {
  if (!shouldNotify(context)) return { requested: false };
  return { requested: true, status: await requestRebuild(secret, options) };
}

export async function main(env = process.env) {
  let event;
  try {
    event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  } catch {
    throw new NotificationError('Cannot read GitHub push event; no deployment requested.');
  }
  const context = {
    eventName: env.GITHUB_EVENT_NAME, ref: env.GITHUB_REF,
    repository: env.GITHUB_REPOSITORY, deleted: event.deleted ?? false,
  };
  if (!isMasterPush(context)) {
    console.log('Skipped: not an eligible Resume/master push.');
    return;
  }
  context.changedPaths = changedApprovedPaths({
    before: event.before, after: event.after, sha: env.GITHUB_SHA,
  });
  const result = await notifyIfEligible(context, env.CLOUDFLARE_DEPLOY_HOOK);
  console.log(result.requested
    ? `Deploy Hook accepted (HTTP ${result.status}); verify completed deployment in Cloudflare.`
    : 'Skipped: no approved source PDF changed.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error instanceof NotificationError ? error.message : 'CV notification failed safely.');
    process.exitCode = 1;
  });
}
