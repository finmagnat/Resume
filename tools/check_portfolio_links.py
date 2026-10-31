"""Read-only release link regression checks. Requires pypdf; never edits files."""
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlparse
from xml.etree import ElementTree as ET
from zipfile import ZipFile

from pypdf import PdfReader
from pypdf.generic import IndirectObject, StreamObject

ROOT = Path(__file__).resolve().parents[1]
PORTFOLIO = "https://yk-developer.pages.dev/"
OLD = re.compile(r"(?:docs\.google\.com|drive\.google\.com|finmagnat\.github\.io/portfolio)", re.I)
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main", "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
RELEASES = [
    "Releases/EN/Yuriy_Kobylyatskiy_Senior_Unity_Developer_EN",
    "Releases/EN/Yuriy_Kobylyatskiy_Unity_Developer_EN",
    "Releases/RU/Yuriy_Kobylyatskiy_Senior_Unity_Developer_RU",
]


def docx_links(path):
    targets = []
    with ZipFile(path) as archive:
        for member in archive.namelist():
            if not member.endswith((".xml", ".rels")):
                continue
            text = archive.read(member).decode("utf-8")
            assert not OLD.search(text), f"Retired URL in {path.relative_to(ROOT)} / {member}"
            if member.endswith(".rels"):
                for rel in ET.fromstring(text):
                    if rel.get("Type", "").endswith("/hyperlink"):
                        targets.append(rel.get("Target", ""))
    return targets


def pdf_links(path):
    data = path.read_bytes()
    assert data.startswith(b"%PDF-") and b"%%EOF" in data[-1024:], f"Invalid PDF: {path.name}"
    assert 10000 <= len(data) <= 5 * 1024 * 1024, f"Unexpected PDF size: {path.name}"
    assert not OLD.search(data.decode("latin1")), f"Retired URL bytes in {path.name}"
    reader = PdfReader(path, strict=True)
    # Inspect decoded objects/streams too, rather than only visible text or URI bytes.
    for generation, entries in reader.xref.items():
        for number in entries:
            if number == 0:
                continue
            obj = reader.get_object(IndirectObject(number, generation, reader))
            assert not OLD.search(str(obj)), f"Retired URL in PDF object: {path.name}"
            if isinstance(obj, StreamObject):
                decoded = obj.get_data()
                for encoding in ("latin1", "utf-16-le", "utf-16-be"):
                    assert not OLD.search(decoded.decode(encoding, errors="ignore")), f"Retired URL in decoded PDF stream: {path.name}"
    targets = []
    for page in reader.pages:
        for item in page.get("/Annots", []):
            annotation = item.get_object()
            action = annotation.get("/A")
            if action:
                action = action.get_object()
                assert not OLD.search(str(action)), f"Retired PDF action in {path.name}"
                if action.get("/S") == "/URI":
                    targets.append(str(action["/URI"]))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    assert text.strip() and "finmagnat@gmail.com" in text, f"Missing readable CV/contact text: {path.name}"
    return targets, len(reader.pages)


def main():
    records = []
    for stem in RELEASES:
        docx, pdf = ROOT / (stem + ".docx"), ROOT / (stem + ".pdf")
        source_targets = docx_links(docx)
        output_targets, pages = pdf_links(pdf)
        for targets in [source_targets, output_targets]:
            assert targets.count(PORTFOLIO) == 1, f"Expected one canonical portfolio link: {stem}"
            assert "https://github.com/finmagnat" in targets, f"GitHub link missing: {stem}"
            assert "https://www.linkedin.com/in/yuriy-kobylyatskiy" in targets, f"LinkedIn link missing: {stem}"
            assert all(urlparse(url).scheme in ("https", "mailto") for url in targets), f"Unexpected target: {stem}"
        assert sorted(source_targets) == sorted(output_targets), f"DOCX/PDF targets differ: {stem}"
        assert pages == 3, f"Unexpected page count: {stem}"
        records.append({"pdf": pdf.relative_to(ROOT).as_posix(), "pages": pages, "bytes": pdf.stat().st_size, "sha256": hashlib.sha256(pdf.read_bytes()).hexdigest(), "targets": output_targets})
    # Inspect other relevant documents too; retain unrelated valid project resources.
    for path in ROOT.joinpath("Releases").rglob("*.docx"):
        docx_links(path)
    for directory in [ROOT, ROOT / "Drafts", ROOT / "Notes"]:
        paths = directory.glob("*.md") if directory == ROOT else directory.rglob("*.md")
        for path in paths:
            assert not OLD.search(path.read_text(encoding="utf-8")), f"Retired URL in {path.relative_to(ROOT)}"
    assert not (ROOT / "Portfolio" / "Portfolio - Yuriy Kobylyatskiy.docx").exists(), "Legacy portfolio must remain retired"
    print(json.dumps({"status": "PASS", "releases": records}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
