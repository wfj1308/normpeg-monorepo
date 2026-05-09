from __future__ import annotations

from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BASE_DIR.parents[1]
DATA_DIR = BASE_DIR / "data"
NORMDOC_DIR = DATA_DIR / "normdocs"
PATCH_DIR = DATA_DIR / "patches"
PROJECT_DIR = DATA_DIR / "projects"
RUNTIME_DIR = DATA_DIR / "runtime"
NOTIFICATION_FILE = RUNTIME_DIR / "notifications.json"
SPU_REGISTRY_FILE = RUNTIME_DIR / "spu_registry.json"
WEB_APP_DIR = REPO_ROOT / "apps" / "executable-spec-web"
WEB_SPU_ASSET_DIR = WEB_APP_DIR / "src" / "compiled-spu"
