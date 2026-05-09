from __future__ import annotations

import copy
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


def build_baseline_schema() -> Dict[str, Any]:
    return {
        "schema_id": "rulepack.golden.baseline.v1",
        "required": [
            "form_code",
            "baseline_rulepack",
            "baseline_runtime_result",
            "baseline_publish_result",
            "updated_at",
        ],
    }


def upsert_golden_baseline(
    *,
    base_dir: Path,
    form_code: str,
    baseline_rulepack: Dict[str, Any],
    baseline_runtime_result: Dict[str, Any],
    baseline_publish_result: Dict[str, Any],
    sample_input: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    form = _as_text(form_code)
    if not form:
        raise ValueError("form_code is required")
    payload = {
        "schema": build_baseline_schema(),
        "form_code": form,
        "baseline_rulepack": copy.deepcopy(_as_dict(baseline_rulepack)),
        "baseline_runtime_result": copy.deepcopy(_as_dict(baseline_runtime_result)),
        "baseline_publish_result": copy.deepcopy(_as_dict(baseline_publish_result)),
        "sample_input": copy.deepcopy(_as_dict(sample_input)),
        "updated_at": _now(),
    }
    path = _baseline_path(base_dir, form)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


def run_golden_regression_check(
    *,
    base_dir: Path,
    report_dir: Path,
    form_code: str,
    candidate_rulepack: Dict[str, Any],
    candidate_publish_result: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    form = _as_text(form_code)
    if not form:
        raise ValueError("form_code is required")
    baseline = _load_baseline(base_dir, form)
    if baseline is None:
        return {
            "form_code": form,
            "status": "no_baseline",
            "passed": True,
            "summary": "no baseline found; skip blocking",
            "checks": [],
        }

    base_rulepack = _as_dict(baseline.get("baseline_rulepack"))
    candidate = _as_dict(candidate_rulepack)
    base_gate_rules = _normalize_rules(_as_dict(base_rulepack.get("gate")).get("rules"))
    cand_gate_rules = _normalize_rules(_as_dict(candidate.get("gate")).get("rules"))

    checks: list[Dict[str, Any]] = []
    checks.append(_check_unexpected_rule_change(base_gate_rules, cand_gate_rules))
    checks.append(_check_missing_gate(base_rulepack, candidate))
    checks.append(_check_semantic_drift(base_rulepack, candidate))
    checks.append(_check_runtime_regression(base_rulepack, candidate, _as_dict(baseline.get("baseline_runtime_result"))))

    has_fail = any(not bool(item.get("passed", True)) for item in checks)
    report = {
        "schema": {
            "schema_id": "rulepack.golden.diff.report.v1",
            "checks": [
                "unexpected_rule_change",
                "missing_gate",
                "semantic_drift",
                "runtime_regression",
            ],
        },
        "meta": {
            "generated_at": _now(),
            "form_code": form,
        },
        "baseline_ref": {
            "updated_at": baseline.get("updated_at"),
        },
        "candidate_ref": {
            "publish_result": copy.deepcopy(_as_dict(candidate_publish_result)),
        },
        "checks": checks,
        "gate": {
            "blocked": has_fail,
            "reason": "golden regression fail" if has_fail else "golden regression pass",
        },
    }
    report_dir.mkdir(parents=True, exist_ok=True)
    (report_dir / "golden_diff_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def _check_unexpected_rule_change(base_rules: Dict[str, Dict[str, Any]], cand_rules: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    changed_ids: list[str] = []
    for rid, base in base_rules.items():
        cand = cand_rules.get(rid)
        if cand is None:
            continue
        if _rule_fingerprint(base) != _rule_fingerprint(cand):
            changed_ids.append(rid)
    added = sorted([rid for rid in cand_rules if rid not in base_rules])
    removed = sorted([rid for rid in base_rules if rid not in cand_rules])
    unexpected = sorted(changed_ids + added + removed)
    return {
        "type": "unexpected_rule_change",
        "passed": len(unexpected) == 0,
        "unexpected_rule_ids": unexpected,
        "details": {"changed": changed_ids, "added": added, "removed": removed},
    }


def _check_missing_gate(base_rulepack: Dict[str, Any], candidate: Dict[str, Any]) -> Dict[str, Any]:
    base_gate = _as_dict(base_rulepack.get("gate"))
    cand_gate = _as_dict(candidate.get("gate"))
    base_rules = _as_list(base_gate.get("rules"))
    cand_rules = _as_list(cand_gate.get("rules"))
    missing = bool(base_rules) and not bool(cand_rules)
    shrink = len(cand_rules) < len(base_rules) if base_rules else False
    fail = missing or shrink
    return {
        "type": "missing_gate",
        "passed": not fail,
        "details": {"baseline_rule_count": len(base_rules), "candidate_rule_count": len(cand_rules)},
    }


def _check_semantic_drift(base_rulepack: Dict[str, Any], candidate: Dict[str, Any]) -> Dict[str, Any]:
    keys = ["component_name", "catalog_id", "standard_id", "version"]
    changes = []
    for key in keys:
        bv = base_rulepack.get(key)
        cv = candidate.get(key)
        if bv != cv:
            changes.append({"field": key, "baseline": bv, "candidate": cv})
    return {
        "type": "semantic_drift",
        "passed": len(changes) == 0,
        "changes": changes,
    }


def _check_runtime_regression(base_rulepack: Dict[str, Any], candidate: Dict[str, Any], baseline_runtime_result: Dict[str, Any]) -> Dict[str, Any]:
    base_gate = _as_dict(base_rulepack.get("gate"))
    cand_gate = _as_dict(candidate.get("gate"))
    base_rules = _normalize_rules(_as_dict(base_gate).get("rules"))
    cand_rules = _normalize_rules(_as_dict(cand_gate).get("rules"))
    expected_status = _as_text(baseline_runtime_result.get("final_status") or baseline_runtime_result.get("gate_summary"))

    risky_changes = []
    for rid, base in base_rules.items():
        cand = cand_rules.get(rid)
        if cand is None:
            continue
        bcond = _as_text(base.get("condition"))
        ccond = _as_text(cand.get("condition"))
        if bcond != ccond:
            risky_changes.append({"rule_id": rid, "baseline_condition": bcond, "candidate_condition": ccond})
    fail = expected_status.upper() == "PASS" and len(risky_changes) > 0
    return {
        "type": "runtime_regression",
        "passed": not fail,
        "expected_runtime_status": expected_status or "UNKNOWN",
        "risky_rule_condition_changes": risky_changes,
    }


def _baseline_path(base_dir: Path, form_code: str) -> Path:
    safe = form_code.replace("/", "_").replace("\\", "_")
    return base_dir / f"{safe}.golden.json"


def _load_baseline(base_dir: Path, form_code: str) -> Dict[str, Any] | None:
    path = _baseline_path(base_dir, form_code)
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
        return payload if isinstance(payload, dict) else None
    except Exception:
        return None


def _normalize_rules(value: Any) -> Dict[str, Dict[str, Any]]:
    result: Dict[str, Dict[str, Any]] = {}
    if not isinstance(value, list):
        return result
    for idx, item in enumerate(value):
        if not isinstance(item, dict):
            continue
        rid = _as_text(item.get("rule_id") or f"rule_{idx+1}")
        result[rid] = item
    return result


def _rule_fingerprint(rule: Dict[str, Any]) -> str:
    core = {
        "rule_id": rule.get("rule_id"),
        "condition": rule.get("condition"),
        "severity": rule.get("severity"),
        "on_fail": rule.get("on_fail"),
    }
    return json.dumps(core, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
