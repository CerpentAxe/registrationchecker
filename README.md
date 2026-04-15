# Registration Checker

Node.js web app for comparing trade mark details extracted from registration certificates (PDF) against Excel data.

## Features

- PDF extraction that supports:
  - multiple certificates and trade marks in one PDF
  - readable text extraction
  - OCR fallback for non-readable or garbage-readable text
- Hugging Face Qwen 2.5 based structured extraction
- Excel extraction with flexible column heading mapping
- Side-by-side card lists:
  - drag/drop reorder (above or below)
  - remove/restore (removed cards minimize and move to bottom)
- Text comparison where Excel is source of truth
- Red highlighting for additions/removals in mismatched fields
- Manual check fields with per-pair checkboxes and Select All:
  - Applicant Address
  - Endorsement
  - Association
  - Disclaimer
  - Admission

## Setup

1. Install dependencies:

   `npm install`

2. Copy `.env.example` to `.env` and set:

   `HF_TOKEN=your_huggingface_token_here`

3. Run:

   `npm start`

4. Open:

   `http://localhost:3000`

## Notes

- Qwen model used: `Qwen/Qwen2.5-72B-Instruct`
- If Qwen extraction fails, the app falls back to rule-based parsing.
- For South Africa, application and registration numbers are treated as equivalent when one is missing.
