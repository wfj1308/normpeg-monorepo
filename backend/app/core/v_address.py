from __future__ import annotations

from typing import Any, Mapping
from urllib.parse import parse_qs, quote, urlencode, urlparse


class VAddressError(ValueError):
    """Raised when v:// address parse/build fails."""


def normalize_project_id(project_id: str) -> str:
    text = str(project_id).strip()
    if not text:
        raise VAddressError("project_id is required")
    if text.startswith("v://"):
        text = text[4:]
    if not text:
        raise VAddressError("project_id is required")
    return text


def parse_v_address(v: str) -> dict[str, Any]:
    text = str(v).strip()
    if not text:
        raise VAddressError("v address is required")

    parsed = urlparse(text)
    if parsed.scheme != "v":
        raise VAddressError("v address must start with v://")

    project_id = normalize_project_id(parsed.netloc)
    stake = parsed.path.lstrip("/").strip()
    if not stake:
        raise VAddressError("v address stake is required")

    query = parse_qs(parsed.query, keep_blank_values=False)

    version = _first_query(query, "version")
    layer = _first_query(query, "layer")
    branch = parsed.fragment.strip() or _first_query(query, "branch")
    timestamp_raw = _first_query(query, "time") or _first_query(query, "timestamp")
    timestamp: int | None = None
    if timestamp_raw is not None:
        try:
            timestamp = int(timestamp_raw)
        except ValueError as exc:
            raise VAddressError("time must be integer unix timestamp") from exc

    return {
        "projectId": project_id,
        "stake": stake,
        "version": version,
        "layer": layer,
        "branch": branch,
        "timestamp": timestamp,
    }


def build_v_address(input_data: Mapping[str, Any]) -> str:
    raw_project_id = input_data.get("projectId", input_data.get("project_id"))
    raw_stake = input_data.get("stake")
    raw_version = input_data.get("version")
    raw_layer = input_data.get("layer")
    raw_branch = input_data.get("branch", input_data.get("branch_id"))
    raw_timestamp = input_data.get("timestamp", input_data.get("time"))

    if not isinstance(raw_stake, str) or not raw_stake.strip():
        raise VAddressError("stake is required")

    project_id = normalize_project_id(str(raw_project_id or ""))
    stake = raw_stake.strip()

    query_items: list[tuple[str, str]] = []
    if raw_version is not None and str(raw_version).strip():
        query_items.append(("version", str(raw_version).strip()))
    if raw_layer is not None and str(raw_layer).strip():
        query_items.append(("layer", str(raw_layer).strip()))
    if raw_timestamp is not None:
        try:
            timestamp_value = int(raw_timestamp)
        except (TypeError, ValueError) as exc:
            raise VAddressError("timestamp must be integer unix timestamp") from exc
        query_items.append(("time", str(timestamp_value)))

    stake_path = quote(stake, safe="+:@-._~")
    query = urlencode(query_items, doseq=False, safe="+:@-._~")
    base = f"v://{project_id}/{stake_path}"
    built = f"{base}?{query}" if query else base
    if raw_branch is not None and str(raw_branch).strip():
        built = f"{built}#{quote(str(raw_branch).strip(), safe=':+@-._~')}"
    return built


def _first_query(query: dict[str, list[str]], key: str) -> str | None:
    values = query.get(key)
    if not values:
        return None
    first = str(values[0]).strip()
    return first if first else None
