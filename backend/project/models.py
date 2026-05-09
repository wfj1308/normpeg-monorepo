from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List


@dataclass
class Project:
    project_id: str
    catalog_id: str
    selected_specs: List[str] = field(default_factory=list)
    overrides: Dict[str, dict] = field(default_factory=dict)
    role_bindings: List[Dict[str, Any]] = field(default_factory=list)
    instrument_bindings: List[Dict[str, Any]] = field(default_factory=list)
    selection_source: str = "explicit_specs"
    scope_filters: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
