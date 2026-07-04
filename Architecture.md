# Resume Architecture

## Goal

This repository is designed to maintain a long-term, version-controlled professional profile, not a single static resume file.

The goal is to keep resumes, portfolio materials, supporting documents, notes, and assets in one structured place where every meaningful change can be reviewed, improved, and traced over time.

## Design Principles

- Single source of truth: the repository is the central place for all career documentation.
- One current version of every document: file names represent the document purpose, not temporary versions.
- Git stores the complete history: previous versions are preserved by commits instead of duplicate files.
- Git tags represent releases: important resume states can be marked and returned to later.
- Russian and English resumes remain synchronized: both language versions should describe the same professional profile.
- Resume is treated as an engineering project: structure, naming, review, versioning, and quality control matter.

## Repository Structure

- `RU/`: Russian resume and cover letter documents.
- `EN/`: English resume and cover letter documents.
- `Portfolio/`: portfolio documents and professional case materials.
- `Interview/`: interview preparation notes, questions, answers, and related materials.
- `Templates/`: reusable document templates for resumes, cover letters, and other career documents.
- `Notes/`: working notes, drafts, decisions, and ideas that are not ready for final documents.
- `Assets/`: shared visual assets such as images, icons, and other media used by documents.

## Versioning Strategy

File names never contain version numbers. A document should have one current file name, while the complete history of changes is stored in Git.

Releases are marked using Git tags. Tags represent stable points in the repository history that can be shared, reviewed, or restored later.

Examples:

- `v1.0`
- `v2.0`
- `v2.1`

## Branch Strategy

The repository follows a GitFlow-like workflow.

- `master`: stable released versions of the professional profile.
- `develop`: current integration branch for prepared changes before release.
- `feature/*`: temporary branches for focused work such as updating the resume, adding portfolio cases, or preparing interview materials.

## Resume Philosophy

- ATS Friendly: documents should be easy for applicant tracking systems to parse.
- Human Friendly: content should also be clear, readable, and useful for recruiters, hiring managers, and technical interviewers.
- Engineering First: structure, clarity, precision, and maintainability are part of the resume quality.
- Results over Responsibilities: achievements and impact are more important than generic task lists.
- Quality over Quantity: every section should earn its place and support the professional story.

## Future Roadmap

Future versions of this repository will include:

- multiple resume variants
- portfolio cases
- interview preparation
- cover letters
- recommendation letters
