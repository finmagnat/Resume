# Professional CV releases

The canonical public portfolio is [yk-developer.pages.dev](https://yk-developer.pages.dev/).
Released resumes are maintained in `Releases/EN` and `Releases/RU`; `master` is the
approved release branch, and changes are prepared in `develop` before release.

The EN Senior and RU Senior Unity Developer PDF files are the approved source for
the portfolio's future static CV synchronization. The additional EN Unity Developer
variant is a separate release and does not replace those stable sync inputs.

## Rebuild and validate

Preserve the existing DOCX layout; edit real hyperlink relationship targets as well
as visible text when necessary. Export with installed Microsoft Word on Windows:

```powershell
powershell -NoProfile -File tools/export_resume_pdfs.ps1
python tools/check_portfolio_links.py
```

The check requires `pypdf` and inspects OOXML relationships/fields, PDF URI annotations,
readable text, page count and file signatures. It reports sizes and SHA-256 hashes.
Install `pypdf` in your chosen Python environment if it is unavailable. Rendering and
comparison of all pages remains part of release review; automated link checks do not
prove unchanged layout.

The obsolete `Portfolio/Portfolio - Yuriy Kobylyatskiy.docx` was retired in TASK-012-S.
Its historical content remains recoverable from Git; do not restore a public link to
that file. No Cloudflare credentials, deployment hook or publication is configured by
these scripts.
