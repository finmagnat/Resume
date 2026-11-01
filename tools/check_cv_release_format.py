#!/usr/bin/env python3
"""Read-only QA for the six manually polished Senior Unity CV release files."""
from __future__ import annotations
from pathlib import Path
import re, sys
from docx import Document
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
SITE = "https://yk-developer.pages.dev/"
CASE = SITE + "projects/wordbattle/"
BASE = "Yuriy_Kobylyatskiy_Senior_Unity_Developer_"
HEADINGS = {
    "RU": ("Ключевые компетенции", "Профессиональный опыт"),
    "EN": ("Core Competencies", "Professional Experience"),
    "UA": ("Ключові компетенції", "Професійний досвід"),
}
errors = []
def fail(msg):
    print("FAIL:", msg)
    errors.append(msg)
def check_language(lang):
    folder = ROOT / "Releases" / lang
    doc_path = folder / (BASE + lang + ".docx")
    pdf_path = folder / (BASE + lang + ".pdf")
    doc = Document(str(doc_path))
    pdf = PdfReader(str(pdf_path))
    paragraphs = [p for p in doc.paragraphs if p.text.strip()]
    text = "\n".join(p.text for p in paragraphs)
    pdf_text = "\n".join(page.extract_text() or "" for page in pdf.pages)
    for token in ("WordBattle", "2007", "2011", "Addressables", "UniTask", "Zenject",
                  "SOLID", "KISS", "DRY", "YAGNI", "Jenkins", "TeamCity"):
        if token not in text:
            fail(f"{lang}: DOCX missing {token}")
        if token not in pdf_text:
            fail(f"{lang}: PDF missing {token}")
    for forbidden in ("github.com/finmagnat/WordBattle", "15+ years", "18+ years"):
        if forbidden in text or forbidden in pdf_text:
            fail(f"{lang}: forbidden phrase {forbidden}")
    if "VContainer" in text:
        fail(f"{lang}: unjustified VContainer claim")
    urls = [r.target_ref for r in doc.part.rels.values() if r.reltype == RT.HYPERLINK]
    pdf_urls = []
    for page in pdf.pages:
        for ref in page.get("/Annots") or []:
            action = ref.get_object().get("/A")
            if action and action.get("/URI"):
                pdf_urls.append(str(action["/URI"]))
    for expected in (SITE, CASE):
        if expected not in urls:
            fail(f"{lang}: DOCX missing actual link {expected}")
        if expected not in pdf_urls:
            fail(f"{lang}: PDF missing actual link {expected}")
    if not 2 <= len(pdf.pages) <= 5:
        fail(f"{lang}: unexpected PDF page count: {len(pdf.pages)}")
    # Quantify the original problem: titles bold, descriptions regular.
    start_label,end_label=HEADINGS[lang]
    start=next((i for i,p in enumerate(paragraphs) if p.text.strip()==start_label),None)
    if start is None:
        fail(f"{lang}: missing competency section")
        bold_report=[]
    else:
        end=next((i for i in range(start+1,len(paragraphs)) if paragraphs[i].text.strip()==end_label),None)
        if end is None:
            fail(f"{lang}: missing experience section")
            end=min(start+12,len(paragraphs))
        bold_report=[]
        for p in paragraphs[start+1:end]:
            if len(p.text)<60 or ":" not in p.text:
                continue
            total=0; bold=0
            for run in p.runs:
                t=len(run.text.strip())
                total+=t
                if run.bold is True or (run.style and run.style.font.bold is True):
                    bold+=t
            ratio=round(bold/max(total,1),3)
            bold_report.append((p.text.split(":")[0][:32],ratio))
            if ratio>0.80:
                fail(f"{lang}: competency line is almost entirely bold: {p.text[:45]!r} ({ratio:.0%})")
        if len(bold_report)<5:
            fail(f"{lang}: expected >=5 competency entries, got {len(bold_report)}")
    doc_chars=sum(len(p.text) for p in paragraphs)
    pdf_chars=len(re.sub(r"\s+", "",pdf_text))
    if pdf_chars < doc_chars * 0.50:
        fail(f"{lang}: suspicious PDF text loss (DOCX={doc_chars}, PDF={pdf_chars})")
    print(f"QA {lang}: DOCX={len(paragraphs)} paragraphs, PDF={len(pdf.pages)} pages, "
          f"WordBattle={text.count('WordBattle')}, links DOCX={len(urls)} PDF={len(pdf_urls)} "
          f"bold ratios={bold_report}")

for lang in ("RU","EN","UA"):
    try:
        check_language(lang)
    except Exception as e:
        fail(f"{lang}: unreadable or invalid documents: {e}")
if errors:
    print(f"QA FAILED: {len(errors)} findings.")
    sys.exit(1)
print("QA PASSED: all six release documents validated without modifying them.")
