from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict


def copilot_query_flow() -> Dict[str, Any]:
    return {
        "name": "engineering_copilot_query_flow_v1",
        "steps": [
            "1) parse question intent and target scope (project/spec/gate/proof/form)",
            "2) retrieve evidence from Proof / Runtime Event / SpecIR",
            "3) build grounded conclusion from retrieved evidence only",
            "4) attach related specir/rule/gate references",
            "5) generate suggested actions with human-confirmation flag for high risk",
        ],
        "hard_constraints": [
            "no evidence, no answer",
            "must cite Proof/Runtime Event/SpecIR evidence",
            "high-risk suggestions must require human confirmation",
        ],
    }


def rag_data_sources() -> Dict[str, Any]:
    return {
        "sources": [
            {"name": "proof_records", "required": True, "keys": ["proof_id", "proof_hash", "status", "rule_id", "gate_id"]},
            {"name": "runtime_events", "required": True, "keys": ["event_type", "rule_id", "gate_id", "result", "timestamp"]},
            {"name": "specir_records", "required": True, "keys": ["specir_id", "rule_id", "gate_id", "clause_text", "normRef"]},
        ],
        "retrieval_strategy": "hybrid keyword+id matching over gate/rule/spec/slot/project tokens",
    }


def answer_structure() -> Dict[str, Any]:
    return {
        "required_fields": [
            "conclusion",
            "evidence",
            "related_specir",
            "related_rule",
            "related_gate",
            "suggested_action",
        ],
        "risk_fields": ["risk_level", "requires_human_confirmation"],
    }


def ask_engineering_copilot(
    *,
    question: str,
    project_context: Dict[str, Any],
    runtime_events: list[Dict[str, Any]],
    proof_records: list[Dict[str, Any]],
    specir_records: list[Dict[str, Any]],
) -> Dict[str, Any]:
    q = str(question or "").strip()
    rt = [x for x in runtime_events if isinstance(x, dict)]
    pf = [x for x in proof_records if isinstance(x, dict)]
    sp = [x for x in specir_records if isinstance(x, dict)]
    matched = _retrieve_evidence(question=q, runtime_events=rt, proof_records=pf, specir_records=sp)
    evidence = matched["evidence"]
    if not evidence:
        return {
            "answer": {
                "conclusion": "证据不足，无法给出结论。",
                "evidence": [],
                "related_specir": [],
                "related_rule": [],
                "related_gate": [],
                "suggested_action": [
                    {
                        "action": "补充 Proof / Runtime Event / SpecIR 数据后再查询。",
                        "risk_level": "unknown",
                        "requires_human_confirmation": True,
                    }
                ],
            },
            "policy_enforced": {"no_evidence_no_answer": True},
            "meta": {"generated_at": _now()},
        }

    related_specir = _extract_ids(matched["specir"], ["specir_id", "spec_id", "id"])
    related_rule = _extract_ids(matched["runtime"] + matched["proof"] + matched["specir"], ["rule_id", "ruleId", "id"])
    related_gate = _extract_ids(matched["runtime"] + matched["proof"] + matched["specir"], ["gate_id", "gateId", "id"])
    risk_level = _risk_level(matched)
    conclusion = _build_conclusion(q, matched, risk_level)
    suggested = _suggest_action(risk_level, q)

    return {
        "copilot_query_flow": copilot_query_flow(),
        "rag_data_sources": rag_data_sources(),
        "answer_structure": answer_structure(),
        "answer": {
            "conclusion": conclusion,
            "evidence": evidence,
            "related_specir": related_specir,
            "related_rule": related_rule,
            "related_gate": related_gate,
            "suggested_action": suggested,
        },
        "meta": {
            "project_id": str(project_context.get("project_id") or ""),
            "risk_level": risk_level,
            "generated_at": _now(),
        },
    }


def _retrieve_evidence(
    *,
    question: str,
    runtime_events: list[Dict[str, Any]],
    proof_records: list[Dict[str, Any]],
    specir_records: list[Dict[str, Any]],
) -> Dict[str, Any]:
    tokens = {t for t in question.lower().replace("？", "?").replace("?", " ").split() if t}

    def hit(row: Dict[str, Any]) -> bool:
        text = str(row).lower()
        return any(tok in text for tok in tokens) if tokens else True

    rt = [x for x in runtime_events if hit(x)]
    pf = [x for x in proof_records if hit(x)]
    sp = [x for x in specir_records if hit(x)]

    evidence: list[Dict[str, Any]] = []
    for item in rt[:5]:
        evidence.append({"source": "runtime_event", "ref": _row_ref(item, ["event_id", "gate_id", "rule_id"]), "payload": item})
    for item in pf[:5]:
        evidence.append({"source": "proof", "ref": _row_ref(item, ["proof_id", "proof_hash", "gate_id"]), "payload": item})
    for item in sp[:5]:
        evidence.append({"source": "specir", "ref": _row_ref(item, ["specir_id", "rule_id", "gate_id"]), "payload": item})

    return {"runtime": rt, "proof": pf, "specir": sp, "evidence": evidence}


def _row_ref(row: Dict[str, Any], keys: list[str]) -> str:
    for key in keys:
        v = str(row.get(key) or "").strip()
        if v:
            return f"{key}:{v}"
    return "unknown_ref"


def _extract_ids(rows: list[Dict[str, Any]], keys: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for row in rows:
        for key in keys:
            v = str(row.get(key) or "").strip()
            if v and v not in seen:
                seen.add(v)
                out.append(v)
                break
    return out


def _risk_level(matched: Dict[str, Any]) -> str:
    runtime = matched["runtime"]
    proof = matched["proof"]
    fail_cnt = sum(1 for x in runtime if str(x.get("result") or "").upper() in {"FAIL", "ERROR", "BLOCK"})
    override_cnt = sum(1 for x in runtime if str(x.get("event_type") or "").lower() == "manual_override")
    incomplete_proof = sum(1 for x in proof if not bool(x.get("complete", True)))
    score = fail_cnt * 2 + override_cnt * 2 + incomplete_proof
    if score >= 6:
        return "high"
    if score >= 3:
        return "medium"
    return "low"


def _build_conclusion(question: str, matched: Dict[str, Any], risk_level: str) -> str:
    rt = matched["runtime"]
    pf = matched["proof"]
    sp = matched["specir"]
    return (
        f"基于 Runtime Event({len(rt)}), Proof({len(pf)}), SpecIR({len(sp)}) 的证据，"
        f"当前问题“{question}”对应风险等级为 {risk_level}。"
    )


def _suggest_action(risk_level: str, question: str) -> list[Dict[str, Any]]:
    needs_confirm = risk_level == "high"
    if "proof" in question.lower() or "证据" in question:
        action = "优先补齐并验证 Proof 完整性，再进行结论确认。"
    elif "失败" in question or "fail" in question.lower():
        action = "对相关 Gate 执行预检并复跑，核查输入与阈值来源。"
    elif "影响" in question:
        action = "执行规则影响分析并输出受影响 Rule/Gate/Form 列表。"
    else:
        action = "补充最新 Runtime Event 与 SpecIR 映射后复查。"
    return [
        {
            "action": action,
            "risk_level": risk_level,
            "requires_human_confirmation": needs_confirm,
        }
    ]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

