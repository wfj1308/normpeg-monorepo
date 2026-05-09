from __future__ import annotations

from typing import Any, Dict, List

from fastapi import HTTPException

from app.config import NOTIFICATION_FILE
from app.services.common import read_json, utc_now, write_json


def _load_notifications() -> List[Dict[str, Any]]:
    if not NOTIFICATION_FILE.exists():
        return []
    raw = read_json(NOTIFICATION_FILE)
    if isinstance(raw, list):
        return raw
    return []


def _save_notifications(rows: List[Dict[str, Any]]) -> None:
    write_json(NOTIFICATION_FILE, rows)


def publish_notifications(project_id: str, impact: Dict[str, Any]) -> List[Dict[str, Any]]:
    rows = _load_notifications()
    created: List[Dict[str, Any]] = []
    for item in impact.get("affected_records", []):
        notification = {
            "notification_id": f"ntf_{project_id}_{item['record_id']}",
            "project_id": project_id,
            "record_id": item["record_id"],
            "stake": item["stake"],
            "message": f"{item['stake']} moved from old standard to new standard. Retest is recommended.",
            "status": "PENDING_ACK",
            "created_at": utc_now(),
            "acked_at": "",
            "acked_by": "",
        }
        rows.append(notification)
        created.append(notification)
    _save_notifications(rows)
    return created


def list_notifications(project_id: str, status: str = "") -> List[Dict[str, Any]]:
    rows = _load_notifications()
    wanted = status.strip().upper()
    items: List[Dict[str, Any]] = []
    for row in rows:
        if row.get("project_id") != project_id:
            continue
        if wanted and str(row.get("status", "")).upper() != wanted:
            continue
        items.append(row)
    return items


def ack_notification(project_id: str, notification_id: str, user_did: str, comment: str) -> Dict[str, Any]:
    rows = _load_notifications()
    target: Dict[str, Any] | None = None
    for row in rows:
        if row.get("project_id") != project_id:
            continue
        if row.get("notification_id") != notification_id:
            continue
        row["status"] = "ACKED"
        row["acked_at"] = utc_now()
        row["acked_by"] = user_did
        row["comment"] = comment
        target = row
        break
    if target is None:
        raise HTTPException(status_code=404, detail=f"Notification not found: {notification_id}")
    _save_notifications(rows)
    return target
