# Professional CV releases

The canonical public portfolio is [yk-developer.pages.dev](https://yk-developer.pages.dev/).
Approved resumes are maintained in `Releases/EN`, `Releases/RU` and `Releases/UA`.
`master` is the approved release branch; edits and validations are prepared in `develop`.
After each release, merge `master` back into `develop` to keep the GitFlow branches synchronized.

## Approved CV files and Cloudflare

The portfolio downloads exactly these three approved Senior Unity Developer PDFs:

- `Releases/EN/Yuriy_Kobylyatskiy_Senior_Unity_Developer_EN.pdf`
- `Releases/RU/Yuriy_Kobylyatskiy_Senior_Unity_Developer_RU.pdf`
- `Releases/UA/Yuriy_Kobylyatskiy_Senior_Unity_Developer_UA.pdf`

On changes to these PDFs in `master`, the **single active** GitHub Actions workflow
`.github/workflows/rebuild-portfolio-on-cv-release.yml` requests a Cloudflare Pages
production rebuild via the `CLOUDFLARE_DEPLOY_HOOK` Actions secret.
During the build, Cloudflare synchronizes all three PDFs from one immutable
`Resume/master` commit. A successful hook response does not by itself prove
deployment success: verify the Cloudflare deployment, file hashes and HTTP headers.

The additional EN Unity Developer PDF is a separate release and does not replace
the approved Senior Unity Developer downloads. Keep deploy URLs, API tokens
and secrets out of committed files and logs.

## Rebuild and validate

Preserve the original DOCX layout and hyperlinks, including OOXML relationship targets.
For the final PDF export use Microsoft Word on Windows:

```powershell
powershell -NoProfile -File tools/export_resume_pdfs.ps1
python tools/check_portfolio_links.py
python tools/check_cv_release_format.py
```

The checks require `pypdf` and/or `python-docx`; they validate DOCX relationships,
PDF annotations, readable text, page counts and file signatures. Rendering and
visual comparison of **every** page remains a release gate.

For isolated candidate generation, `python tools/build_cv_releases.py` writes to
the ignored `.artifacts/cv-preview/` directory by default, **without overwriting**
the manually approved `Releases/` documents.

The obsolete `Portfolio/Portfolio - Yuriy Kobylyatskiy.docx` was retired in
TASK-012-S. Its historical content remains recoverable in Git; do not restore
a public link to the obsolete portfolio file.
