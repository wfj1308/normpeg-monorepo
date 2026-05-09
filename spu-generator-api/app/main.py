from __future__ import annotations

from pathlib import Path
from typing import Dict

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.spu import create_spu_router
from app.storage.output_store import OutputStore


BASE_DIR = Path(__file__).resolve().parents[1]
RUNTIME_DIR = BASE_DIR / "runtime" / "spu_outputs"
OUTPUT_STORE = OutputStore(runtime_dir=RUNTIME_DIR)

app = FastAPI(title="spu-generator-api", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(create_spu_router(OUTPUT_STORE))


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}

