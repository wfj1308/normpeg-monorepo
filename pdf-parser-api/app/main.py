from __future__ import annotations

from pathlib import Path
from typing import Dict

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.pdf import create_pdf_router
from app.storage.result_store import ParseResultStore


BASE_DIR = Path(__file__).resolve().parents[1]
RUNTIME_DIR = BASE_DIR / "runtime" / "parse_results"
RESULT_STORE = ParseResultStore(runtime_dir=RUNTIME_DIR)

app = FastAPI(title="pdf-parser-api", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(create_pdf_router(RESULT_STORE))


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}

