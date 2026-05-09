"""
ERPNext (Frappe) side methods for QCSpec integration.
Place this file into your custom app, e.g.:
  apps/zbgc_integration/zbgc_integration/qcspec.py
Then run:
  bench --site development.localhost clear-cache
"""

from __future__ import annotations

import json
from typing import Any

import frappe


def _to_float(value: Any) -> float | None:
    try:
        if value is None or value == "":
            return None
        return float(value)
    except Exception:
        return None


@frappe.whitelist(allow_guest=False)
def get_project_basics(project_code: str | None = None, project_name: str | None = None) -> dict[str, Any]:
    """
    QCSpec -> ERPNext:
      GET /api/method/zbgc_integration.qcspec.get_project_basics
    Return canonical basic info for project registration.
    """
    if not frappe.db.exists("DocType", "Project"):
        return {"ok": False, "reason": "doctype_project_missing"}
    if not project_code and not project_name:
        return {"ok": False, "reason": "project_code_or_project_name_required"}

    filters = {"name": project_code} if project_code else {"project_name": project_name}
    names = frappe.get_all("Project", filters=filters, pluck="name", limit=1)
    if not names:
        return {
            "ok": False,
            "reason": "project_not_found",
            "project_code": project_code,
            "project_name": project_name,
        }

    doc = frappe.get_doc("Project", names[0])
    return {
        "ok": True,
        "project_code": doc.name,
        "project_name": doc.get("project_name"),
        "owner_unit": doc.get("custom_owner_unit") or "",
        "contractor": doc.get("custom_contractor") or "",
        "supervisor": doc.get("custom_supervisor") or "",
        "contract_no": doc.get("custom_contract_no") or "",
        "start_date": str(doc.get("expected_start_date") or ""),
        "end_date": str(doc.get("expected_end_date") or ""),
        "description": doc.get("notes") or "",
    }


@frappe.whitelist(allow_guest=False)
def get_metering_requests(
    project_code: str | None = None,
    stake: str | None = None,
    subitem: str | None = None,
    status: str | None = "pending",
) -> list[dict[str, Any]]:
    """
    QCSpec -> ERPNext:
      GET /api/method/zbgc_integration.qcspec.get_metering_requests
    Return metering requests waiting for QC release/block decision.
    """
    conditions = []
    values: list[Any] = []
    if project_code:
        conditions.append("project = %s")
        values.append(project_code)
    if stake:
        conditions.append("stake = %s")
        values.append(stake)
    if subitem:
        conditions.append("subitem = %s")
        values.append(subitem)
    if status:
        conditions.append("status = %s")
        values.append(status)

    where = " and ".join(conditions) if conditions else "1=1"
    rows = frappe.db.sql(
        f"""
        select
          name,
          project,
          stake,
          subitem,
          amount,
          status
        from `tabQC Metering Request`
        where {where}
        order by modified desc
        limit 50
        """,
        values=values,
        as_dict=True,
    )
    return [
        {
            "id": r.get("name"),
            "project": r.get("project"),
            "stake": r.get("stake"),
            "subitem": r.get("subitem"),
            "amount": _to_float(r.get("amount")),
            "status": r.get("status"),
        }
        for r in rows
    ]


@frappe.whitelist(allow_guest=False)
def notify(**kwargs) -> dict[str, Any]:
    """
    QCSpec -> ERPNext:
      POST /api/method/zbgc_integration.qcspec.notify
    QCSpec sends gate decision after inspection is stored+proofed.
    """
    data = dict(kwargs or {})
    metering_action = str(data.get("metering_action") or "").strip().lower()
    metering_request_id = str(data.get("metering_request_id") or "").strip()

    if frappe.db.exists("DocType", "QCSpec Notify Log"):
        log = frappe.get_doc(
            {
                "doctype": "QCSpec Notify Log",
                "project_id": data.get("project_id"),
                "project_name": data.get("project_name"),
                "stake": data.get("stake"),
                "subitem": data.get("subitem"),
                "inspection_id": data.get("inspection_id"),
                "proof_id": data.get("proof_id"),
                "quality_passed": 1 if data.get("quality_passed") else 0,
                "metering_action": metering_action,
                "metering_request_id": metering_request_id or None,
                "raw_payload": json.dumps(data, ensure_ascii=False),
            }
        )
        log.insert(ignore_permissions=True)

    if metering_request_id and frappe.db.exists("DocType", "QC Metering Request"):
        if metering_action == "release":
            frappe.db.set_value("QC Metering Request", metering_request_id, "status", "qc_released")
        elif metering_action == "block":
            frappe.db.set_value("QC Metering Request", metering_request_id, "status", "qc_blocked")

    frappe.db.commit()
    return {"ok": True, "action": metering_action, "metering_request_id": metering_request_id}
