from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

from app.services.specir_derivation import derive_rules_and_gates_from_specir

try:
    from jsonschema import Draft202012Validator  # type: ignore
except Exception:  # pragma: no cover
    Draft202012Validator = None  # type: ignore


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _runtime_root() -> Path:
    return Path(__file__).resolve().parents[1] / "runtime" / "parse_results"


def _load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _load_form_asset_whitelist(form_code: str) -> Dict[str, set[str]]:
    path = _repo_root() / "apps" / "nl2gate-api" / "config" / "form_asset_whitelists.json"
    if not path.exists():
        return {
            "allowed_specir_ids": set(),
            "allowed_normRefs": set(),
            "allowed_components": set(),
            "allowed_rules": set(),
            "allowed_gates": set(),
        }
    obj = _load_json(path)
    key = str(form_code).strip()
    alias = {"bridge13": "bridge_shi_13"}.get(key, key)
    row = obj.get(alias, {}) if isinstance(obj, dict) else {}
    if not isinstance(row, dict):
        row = {}
    out: Dict[str, set[str]] = {}
    for key in ("allowed_specir_ids", "allowed_normRefs", "allowed_components", "allowed_rules", "allowed_gates"):
        vals = row.get(key, [])
        out[key] = {str(x).strip() for x in vals if str(x).strip()} if isinstance(vals, list) else set()
    return out


def _collect_approved_specirs_from_parse(parse_id: str) -> List[Dict[str, Any]]:
    p = _runtime_root() / parse_id / "specir_approved.json"
    if not p.exists():
        return []
    try:
        doc = _load_json(p)
    except Exception:
        return []
    items = doc.get("approved_specirs", []) if isinstance(doc, dict) else []
    if not isinstance(items, list):
        return []
    rows: List[Dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        if str(item.get("status", "")).strip() == "approved" and isinstance(item.get("signatures"), list) and len(item.get("signatures")) > 0:
            rows.append(item)
    return rows


def _filter_specirs_by_whitelist(specirs: List[Dict[str, Any]], wl: Dict[str, set[str]]) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    pre = len(specirs)
    out = list(specirs)
    allowed_specir_ids = wl.get("allowed_specir_ids", set())
    allowed_normrefs = wl.get("allowed_normRefs", set())
    if allowed_specir_ids:
        out = [x for x in out if str(x.get("specir_id", "")).strip() in allowed_specir_ids]
    if allowed_normrefs:
        out = [x for x in out if str(x.get("normRef", "")).strip() in allowed_normrefs]
    return out, {"pre_specirs": pre, "post_specirs": len(out), "filtered_out_count": max(pre - len(out), 0)}


def _filter_rules_and_gates(
    rules: List[Dict[str, Any]],
    gates: List[Dict[str, Any]],
    wl: Dict[str, set[str]],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, int]]:
    pre_rules = len(rules)
    pre_gates = len(gates)
    out_rules = list(rules)
    out_gates = list(gates)

    allowed_rules = wl.get("allowed_rules", set())
    allowed_gates = wl.get("allowed_gates", set())
    allowed_components = wl.get("allowed_components", set())
    if allowed_rules:
        candidate_rules = [r for r in out_rules if str(r.get("rule_id", "")).strip() in allowed_rules]
        if len(candidate_rules) > 0:
            out_rules = candidate_rules
    if allowed_components:
        out_rules = [r for r in out_rules if str(r.get("field", "")).strip() in allowed_components or str(r.get("specir_id", "")).strip() in allowed_components]
    valid_rule_ids = {str(r.get("rule_id", "")).strip() for r in out_rules if str(r.get("rule_id", "")).strip()}
    out_gates = [g for g in out_gates if str(g.get("rule_id", "")).strip() in valid_rule_ids]
    if allowed_gates:
        candidate_gates = [g for g in out_gates if str(g.get("gate_id", "")).strip() in allowed_gates]
        if len(candidate_gates) > 0:
            out_gates = candidate_gates

    return out_rules, out_gates, {
        "pre_rules": pre_rules,
        "post_rules": len(out_rules),
        "pre_gates": pre_gates,
        "post_gates": len(out_gates),
        "filtered_out_rules": max(pre_rules - len(out_rules), 0),
        "filtered_out_gates": max(pre_gates - len(out_gates), 0),
    }


def _build_traceability(specirs: List[Dict[str, Any]], rules: List[Dict[str, Any]], gates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    specir_map = {str(s.get("specir_id", "")).strip(): s for s in specirs if isinstance(s, dict)}
    gate_by_rule = {str(g.get("rule_id", "")).strip(): g for g in gates if isinstance(g, dict)}
    out: List[Dict[str, Any]] = []
    for r in rules:
        if not isinstance(r, dict):
            continue
        sid = str(r.get("source_specir_id", "")).strip()
        s = specir_map.get(sid, {})
        src = s.get("source", {}) if isinstance(s.get("source"), dict) else {}
        g = gate_by_rule.get(str(r.get("rule_id", "")).strip(), {})
        out.append(
            {
                "rule_id": str(r.get("rule_id", "")).strip(),
                "gate_id": str(g.get("gate_id", "")).strip(),
                "specir_id": sid,
                "normRef": str(r.get("normRef", "")).strip(),
                "source_text": str(src.get("source_text", "")).strip(),
                "page_no": int(src.get("page_no", 0) or 0),
            }
        )
    return out


def _build_traceability_report(specirs: List[Dict[str, Any]], rules: List[Dict[str, Any]], gates: List[Dict[str, Any]], traceability: List[Dict[str, Any]]) -> Dict[str, Any]:
    specir_map = {str(s.get("specir_id", "")).strip(): s for s in specirs if isinstance(s, dict)}
    trace_by_rule = {str(t.get("rule_id", "")).strip(): t for t in traceability if isinstance(t, dict)}
    rule_rows: List[Dict[str, Any]] = []
    gate_rows: List[Dict[str, Any]] = []

    for r in rules:
        if not isinstance(r, dict):
            continue
        rid = str(r.get("rule_id", "")).strip()
        sid = str(r.get("source_specir_id", "")).strip()
        t = trace_by_rule.get(rid, {})
        norm_ref = str(t.get("normRef", "")).strip() or str(r.get("normRef", "")).strip()
        source_text = str(t.get("source_text", "")).strip() or str(r.get("source_text", "")).strip()
        page_no = int(t.get("page_no", 0) or 0)
        missing = []
        if not sid:
            missing.append("specir_id")
        if not norm_ref:
            missing.append("normRef")
        if not source_text:
            missing.append("source_text")
        if page_no <= 0:
            missing.append("page_no")
        rule_rows.append(
            {
                "asset_type": "rule",
                "asset_id": rid,
                "specir_id": sid,
                "normRef": norm_ref,
                "source_text": source_text,
                "page_no": page_no,
                "traceable": len(missing) == 0,
                "missing_fields": missing,
            }
        )

    for g in gates:
        if not isinstance(g, dict):
            continue
        gid = str(g.get("gate_id", "")).strip()
        sid = str(g.get("source_specir_id", "")).strip()
        s = specir_map.get(sid, {})
        src = s.get("source", {}) if isinstance(s.get("source"), dict) else {}
        norm_ref = str(g.get("normRef", "")).strip() or str(s.get("normRef", "")).strip()
        source_text = str(g.get("source_text", "")).strip() or str(src.get("source_text", "")).strip()
        page_no = int(src.get("page_no", 0) or 0)
        missing = []
        if not sid:
            missing.append("specir_id")
        if not norm_ref:
            missing.append("normRef")
        if not source_text:
            missing.append("source_text")
        if page_no <= 0:
            missing.append("page_no")
        gate_rows.append(
            {
                "asset_type": "gate",
                "asset_id": gid,
                "specir_id": sid,
                "normRef": norm_ref,
                "source_text": source_text,
                "page_no": page_no,
                "traceable": len(missing) == 0,
                "missing_fields": missing,
            }
        )

    failed_rows = [x for x in (rule_rows + gate_rows) if not bool(x.get("traceable", False))]
    return {
        "status": "success" if len(failed_rows) == 0 else "failed",
        "summary": {
            "rule_count": len(rule_rows),
            "gate_count": len(gate_rows),
            "traceable_rule_count": len([x for x in rule_rows if bool(x.get("traceable", False))]),
            "traceable_gate_count": len([x for x in gate_rows if bool(x.get("traceable", False))]),
            "missing_count": len(failed_rows),
        },
        "rules": rule_rows,
        "gates": gate_rows,
        "failed_items": failed_rows,
    }


def _validate_schema(payload: Dict[str, Any]) -> Tuple[bool, List[str]]:
    schema_path = _repo_root() / "packages" / "normpeg-schemas" / "jsonschema" / "rulepack-single-form-v1.schema.json"
    if not schema_path.exists():
        return False, [f"schema not found: {schema_path}"]
    if Draft202012Validator is None:
        return True, []
    schema = _load_json(schema_path)
    validator = Draft202012Validator(schema)
    errs = sorted(validator.iter_errors(payload), key=lambda e: list(e.path))
    lines = []
    for e in errs:
        loc = ".".join(str(x) for x in e.path) or "<root>"
        lines.append(f"{loc}: {e.message}")
    return len(lines) == 0, lines


def _dup_ids(rows: List[Dict[str, Any]], key: str) -> List[str]:
    seen: set[str] = set()
    dup: set[str] = set()
    for row in rows:
        if not isinstance(row, dict):
            continue
        val = str(row.get(key, "")).strip()
        if not val:
            continue
        if val in seen:
            dup.add(val)
        seen.add(val)
    return sorted(dup)


def _validate_rulepack_semantics(payload: Dict[str, Any], traceability_report: Dict[str, Any]) -> Tuple[bool, List[str], Dict[str, Any]]:
    errs: List[str] = []
    meta = payload.get("meta", {}) if isinstance(payload.get("meta"), dict) else {}
    rules = payload.get("rules", []) if isinstance(payload.get("rules"), list) else []
    gates = payload.get("gates", []) if isinstance(payload.get("gates"), list) else []
    components = payload.get("components", []) if isinstance(payload.get("components"), list) else []
    traceability = payload.get("traceability", []) if isinstance(payload.get("traceability"), list) else []

    # 1) meta complete (stronger runtime check)
    for field in ("form_code", "norm_id", "norm_version", "rulepack_version", "generated_at", "selection_mode", "counts"):
        v = meta.get(field)
        if (isinstance(v, str) and not v.strip()) or v is None:
            errs.append(f"meta.{field} missing")

    # 2/3/4) unique IDs
    dup_component_ids = _dup_ids([x for x in components if isinstance(x, dict)], "component_id")
    dup_rule_ids = _dup_ids([x for x in rules if isinstance(x, dict)], "rule_id")
    dup_gate_ids = _dup_ids([x for x in gates if isinstance(x, dict)], "gate_id")
    if dup_component_ids:
        errs.append(f"duplicate component_id: {', '.join(dup_component_ids[:10])}")
    if dup_rule_ids:
        errs.append(f"duplicate rule_id: {', '.join(dup_rule_ids[:10])}")
    if dup_gate_ids:
        errs.append(f"duplicate gate_id: {', '.join(dup_gate_ids[:10])}")

    # 5) all ruleRef resolvable (gate.rule_id -> rules, traceability.rule_id -> rules)
    rule_ids = {str(r.get("rule_id", "")).strip() for r in rules if isinstance(r, dict) and str(r.get("rule_id", "")).strip()}
    gate_rule_refs = [str(g.get("rule_id", "")).strip() for g in gates if isinstance(g, dict)]
    missing_rule_refs = sorted({rid for rid in gate_rule_refs if rid and rid not in rule_ids})
    trace_rule_refs = [str(t.get("rule_id", "")).strip() for t in traceability if isinstance(t, dict)]
    missing_trace_rule_refs = sorted({rid for rid in trace_rule_refs if rid and rid not in rule_ids})
    if missing_rule_refs:
        errs.append(f"unresolvable ruleRef in gates: {', '.join(missing_rule_refs[:10])}")
    if missing_trace_rule_refs:
        errs.append(f"unresolvable ruleRef in traceability: {', '.join(missing_trace_rule_refs[:10])}")

    # 6) all gateRef resolvable (traceability.gate_id -> gates)
    gate_ids = {str(g.get("gate_id", "")).strip() for g in gates if isinstance(g, dict) and str(g.get("gate_id", "")).strip()}
    trace_gate_refs = [str(t.get("gate_id", "")).strip() for t in traceability if isinstance(t, dict)]
    missing_gate_refs = sorted({gid for gid in trace_gate_refs if gid and gid not in gate_ids})
    if missing_gate_refs:
        errs.append(f"unresolvable gateRef in traceability: {', '.join(missing_gate_refs[:10])}")

    # 7) traceability complete
    if str(traceability_report.get("status", "")) != "success":
        summary = traceability_report.get("summary", {}) if isinstance(traceability_report.get("summary"), dict) else {}
        errs.append(f"traceability incomplete: missing_count={int(summary.get('missing_count', 0) or 0)}")

    report = {
        "duplicate_component_id_count": len(dup_component_ids),
        "duplicate_rule_id_count": len(dup_rule_ids),
        "duplicate_gate_id_count": len(dup_gate_ids),
        "missing_rule_ref_in_gates_count": len(missing_rule_refs),
        "missing_rule_ref_in_traceability_count": len(missing_trace_rule_refs),
        "missing_gate_ref_in_traceability_count": len(missing_gate_refs),
    }
    return len(errs) == 0, errs, report


def _load_previous_rulepack(form_code: str) -> Dict[str, Any]:
    safe = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in str(form_code or "").strip()) or "unknown_form"
    path = _runtime_root() / "rulepacks" / f"{safe}.rulepack.json"
    if not path.exists():
        return {}
    try:
        doc = _load_json(path)
        return doc if isinstance(doc, dict) else {}
    except Exception:
        return {}


def _rule_signature(rule: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "field": str(rule.get("field", "")).strip(),
        "operator": str(rule.get("operator", "")).strip(),
        "threshold": rule.get("threshold"),
        "unit": str(rule.get("unit", "")).strip(),
        "condition": str(rule.get("condition", "")).strip(),
        "normRef": str(rule.get("normRef", "")).strip(),
        "source_specir_id": str(rule.get("source_specir_id", "")).strip(),
    }


def _build_rulepack_diff(form_code: str, payload: Dict[str, Any], *, threshold: float = 0.2) -> Dict[str, Any]:
    prev = _load_previous_rulepack(form_code)
    prev_rules = prev.get("rules", []) if isinstance(prev.get("rules"), list) else []
    curr_rules = payload.get("rules", []) if isinstance(payload.get("rules"), list) else []
    prev_gates = prev.get("gates", []) if isinstance(prev.get("gates"), list) else []
    curr_gates = payload.get("gates", []) if isinstance(payload.get("gates"), list) else []

    prev_map = {str(x.get("rule_id", "")).strip(): x for x in prev_rules if isinstance(x, dict) and str(x.get("rule_id", "")).strip()}
    curr_map = {str(x.get("rule_id", "")).strip(): x for x in curr_rules if isinstance(x, dict) and str(x.get("rule_id", "")).strip()}
    prev_ids = set(prev_map.keys())
    curr_ids = set(curr_map.keys())
    added_ids = sorted([x for x in curr_ids if x not in prev_ids])
    removed_ids = sorted([x for x in prev_ids if x not in curr_ids])
    common_ids = sorted([x for x in curr_ids if x in prev_ids])

    modified: List[Dict[str, Any]] = []
    for rid in common_ids:
        a = _rule_signature(prev_map[rid])
        b = _rule_signature(curr_map[rid])
        if a != b:
            changed = [k for k in a.keys() if a.get(k) != b.get(k)]
            modified.append({"rule_id": rid, "changed_fields": changed, "previous": a, "current": b})

    prev_count = len(prev_rules)
    curr_count = len(curr_rules)
    delta = abs(curr_count - prev_count)
    delta_pct = (float(delta) / float(prev_count)) if prev_count > 0 else (1.0 if curr_count > 0 else 0.0)
    warnings: List[str] = []
    if delta_pct > threshold:
        warnings.append("RULE_COUNT_CHANGE_GT_20PCT")
    if len(prev_gates) > 0 and len(curr_gates) == 0:
        warnings.append("GATE_LOSS")

    return {
        "generated_at": _utc_now(),
        "form_code": form_code,
        "previous_rule_count": prev_count,
        "current_rule_count": curr_count,
        "added_rules": added_ids,
        "removed_rules": removed_ids,
        "modified_rules": modified,
        "previous_gate_count": len(prev_gates),
        "current_gate_count": len(curr_gates),
        "rule_count_change_pct": delta_pct,
        "warning": delta_pct > threshold or (len(prev_gates) > 0 and len(curr_gates) == 0),
        "warnings": warnings,
    }


def _whitelist_violation_count(payload: Dict[str, Any], wl: Dict[str, set[str]]) -> int:
    violations = 0
    components = payload.get("components", []) if isinstance(payload.get("components"), list) else []
    rules = payload.get("rules", []) if isinstance(payload.get("rules"), list) else []
    gates = payload.get("gates", []) if isinstance(payload.get("gates"), list) else []
    specir_allow = wl.get("allowed_specir_ids", set())
    normref_allow = wl.get("allowed_normRefs", set())
    comp_allow = wl.get("allowed_components", set())
    rule_allow = wl.get("allowed_rules", set())
    gate_allow = wl.get("allowed_gates", set())

    for c in components:
        if not isinstance(c, dict):
            continue
        cid = str(c.get("component_id", "")).strip()
        sid = str(c.get("specir_id", "")).strip()
        nref = str(c.get("normRef", "")).strip()
        if comp_allow and cid and cid not in comp_allow:
            violations += 1
        if specir_allow and sid and sid not in specir_allow:
            violations += 1
        if normref_allow and nref and nref not in normref_allow:
            violations += 1
    for r in rules:
        if not isinstance(r, dict):
            continue
        rid = str(r.get("rule_id", "")).strip()
        sid = str(r.get("specir_id", "")).strip()
        nref = str(r.get("normRef", "")).strip()
        if rule_allow and rid and rid not in rule_allow:
            violations += 1
        if specir_allow and sid and sid not in specir_allow:
            violations += 1
        if normref_allow and nref and nref not in normref_allow:
            violations += 1
    for g in gates:
        if not isinstance(g, dict):
            continue
        gid = str(g.get("gate_id", "")).strip()
        if gate_allow and gid and gid not in gate_allow:
            violations += 1
    return violations


def build_rulepack(
    form_code: str,
    *,
    whitelist: Dict[str, Any] | None = None,
    approved_specirs: List[Dict[str, Any]] | None = None,
    parse_id: str = "",
) -> Dict[str, Any]:
    wl = _load_form_asset_whitelist(form_code) if whitelist is None else {
        "allowed_specir_ids": {str(x).strip() for x in (whitelist.get("allowed_specir_ids", []) if isinstance(whitelist, dict) else []) if str(x).strip()},
        "allowed_normRefs": {str(x).strip() for x in (whitelist.get("allowed_normRefs", []) if isinstance(whitelist, dict) else []) if str(x).strip()},
        "allowed_components": {str(x).strip() for x in (whitelist.get("allowed_components", []) if isinstance(whitelist, dict) else []) if str(x).strip()},
        "allowed_rules": {str(x).strip() for x in (whitelist.get("allowed_rules", []) if isinstance(whitelist, dict) else []) if str(x).strip()},
        "allowed_gates": {str(x).strip() for x in (whitelist.get("allowed_gates", []) if isinstance(whitelist, dict) else []) if str(x).strip()},
    }
    if approved_specirs is None:
        if not parse_id:
            return {"status": "failed", "blockers": ["approved_specirs input is required (no full-library scan)"]}
        approved_specirs = _collect_approved_specirs_from_parse(parse_id)
    approved_specirs = [x for x in approved_specirs if isinstance(x, dict)]
    selected_specirs, specir_counts = _filter_specirs_by_whitelist(approved_specirs, wl)
    derived = derive_rules_and_gates_from_specir({"specirs": selected_specirs})
    rules = [x for x in derived.get("rules", []) if isinstance(x, dict)]
    gates = [x for x in derived.get("gates", []) if isinstance(x, dict)]
    unresolved = derived.get("unresolved", {}) if isinstance(derived.get("unresolved"), dict) else {}
    unresolved_count = int(unresolved.get("count", 0) or 0)

    rules, gates, rg_counts = _filter_rules_and_gates(rules, gates, wl)
    traceability = _build_traceability(selected_specirs, rules, gates)
    traceability_report = _build_traceability_report(selected_specirs, rules, gates, traceability)

    gate_rule_ids = {str(g.get("rule_id", "")).strip() for g in gates if str(g.get("rule_id", "")).strip()}
    missing_gate_ref_count = len([r for r in rules if str(r.get("rule_id", "")).strip() not in gate_rule_ids])
    missing_source_specir_rule_count = len([r for r in rules if not str(r.get("source_specir_id", "")).strip()])
    missing_source_specir_gate_count = len([g for g in gates if not str(g.get("source_specir_id", "")).strip()])
    missing_source_specir_id_count = int(missing_source_specir_rule_count + missing_source_specir_gate_count)

    payload: Dict[str, Any] = {
        "meta": {
            "form_code": form_code,
            "norm_id": str(selected_specirs[0].get("norm_id", "")).strip() if selected_specirs else "",
            "norm_version": str(selected_specirs[0].get("norm_version", "")).strip() if selected_specirs else "",
            "rulepack_version": "v1",
            "generated_at": _utc_now(),
            "selection_mode": "single_form",
            "counts": {
                "components": len(rules),
                "rules": len(rules),
                "gates": len(gates),
                "traceability": len(traceability),
            },
            "selection_stats": {
                "selected_specir_count": len(selected_specirs),
                "filtered_out_count": int(specir_counts.get("filtered_out_count", 0) + rg_counts.get("filtered_out_rules", 0) + rg_counts.get("filtered_out_gates", 0)),
                "gate_count": len(gates),
            },
        },
        "components": [
            {
                "component_id": str(r.get("field", "")).strip() or str(r.get("specir_id", "")).strip(),
                "specir_id": str(r.get("specir_id", "")).strip(),
                "title": str(r.get("field", "")).strip() or "derived_component",
                "normRef": str(r.get("normRef", "")).strip(),
                "source_clause": str(r.get("normRef", "")).strip().split("/")[-1],
            }
            for r in rules
        ],
        "rules": rules,
        "gates": gates,
        "traceability": traceability,
    }
    rulepack_diff = _build_rulepack_diff(form_code, payload)

    schema_ok, schema_errors = _validate_schema(payload)
    semantic_ok, semantic_errors, semantic_report = _validate_rulepack_semantics(payload, traceability_report)
    whitelist_violations = _whitelist_violation_count(payload, wl)
    blockers: List[str] = []
    if not schema_ok:
        blockers.append("schema_validation_failed")
    if not semantic_ok:
        blockers.append("semantic_validation_failed")
    if len(rules) == 0:
        blockers.append("rules.length == 0")
    if len(gates) == 0:
        blockers.append("gates.length == 0")
    if missing_gate_ref_count != 0:
        blockers.append(f"missing_gateRef_count = {missing_gate_ref_count}")
    if missing_source_specir_id_count != 0:
        blockers.append(f"missing_source_specir_id_count = {missing_source_specir_id_count}")
    if unresolved_count != 0:
        blockers.append(f"unresolved_count = {unresolved_count}")
    if str(traceability_report.get("status", "")) != "success":
        summary = traceability_report.get("summary", {}) if isinstance(traceability_report.get("summary"), dict) else {}
        missing_count = int(summary.get("missing_count", 0) or 0)
        blockers.append(f"traceability_missing_count = {missing_count}")
    if whitelist_violations > 0:
        blockers.append(f"whitelist_violation_count = {whitelist_violations}")

    return {
        "status": "success" if len(blockers) == 0 else "failed",
        "build_status": "success" if len(blockers) == 0 else "failed",
        "form_code": form_code,
        "rulepack": payload,
        "gate_checks": {
            "schema_ok": schema_ok,
            "schema_errors": schema_errors,
            "semantic_ok": semantic_ok,
            "semantic_errors": semantic_errors,
            "semantic_report": semantic_report,
            "whitelist_violation_count": whitelist_violations,
            "rules_length": len(rules),
            "gates_length": len(gates),
            "missing_gateRef_count": missing_gate_ref_count,
            "missing_source_specir_id_count": missing_source_specir_id_count,
            "unresolved_count": unresolved_count,
        },
        "filter_stats": {
            **specir_counts,
            **rg_counts,
            "filtered_out_count": int(specir_counts.get("filtered_out_count", 0) + rg_counts.get("filtered_out_rules", 0) + rg_counts.get("filtered_out_gates", 0)),
            "selected_specir_count": len(selected_specirs),
            "gate_count": len(gates),
        },
        "rulepack_diff": rulepack_diff,
        "traceability_report": traceability_report,
        "blockers": blockers,
    }
