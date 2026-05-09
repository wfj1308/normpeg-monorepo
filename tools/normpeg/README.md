# NormRef Ingest Batch (MVP)

This tool parses purchased standards PDF files into machine-reviewable rule candidates.

## What It Produces

- `ingest-report-latest.json` style report
- section candidates (clause tree seed)
- table rows extracted from PDF
- formula and term candidates
- rule candidates with confidence/status
- optional published versioned rule JSON files

## Install

```bash
pip install -r tools/normpeg/requirements.txt
```

## Run

Parse one PDF:

```bash
python tools/normpeg/normref_ingest_batch.py --input "D:/specs/JTG-F80-1-2017.pdf"
```

Parse with explicit spec metadata:

```bash
python tools/normpeg/normref_ingest_batch.py \
  --spec "D:/specs/JTG-3450-2019.pdf|JTG-3450-2019|industry|Highway Test Methods"
```

Parse and publish approved candidates:

```bash
python tools/normpeg/normref_ingest_batch.py \
  --input "D:/specs/JTG-F80-1-2017.pdf" \
  --publish \
  --write-to-docs \
  --version-tag 2026-04 \
  --ocr-max-pages 40
```

Enable AI preprocessing (chapter tree / structured measured items / formula latex / term map candidates):

```bash
set OPENAI_BASE_URL=http://127.0.0.1:11434/v1
set NORMPEG_AI_MODEL=deepseek-chat
python tools/normpeg/normref_ingest_batch.py \
  --input "D:/specs/JTG-F80-1-2017.pdf" \
  --ai-preprocess \
  --ai-model deepseek-chat \
  --ai-max-pages 30 \
  --ai-max-chars 35000
```

## Notes

- Preferred extraction engine: `pdfplumber`.
- Fallback extraction: `pypdf`.
- OCR fallback (for scanned PDF): `rapidocr-onnxruntime` + `pypdfium2`.
- If no input is passed, the tool auto-scans:
  - `standards/raw`
  - `docs/normref/std/raw`
  - `inputs/standards`
- Local Ollama does not require `OPENAI_API_KEY` (when base URL points to Ollama).
- Cloud OpenAI-compatible providers usually require `OPENAI_API_KEY`.
