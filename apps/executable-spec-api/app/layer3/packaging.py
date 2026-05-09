from __future__ import annotations

from typing import Any, Dict


def package_result(trace: Dict[str, Any], execution_result: Dict[str, Any]) -> str:
    gate = execution_result.get("gate", {})
    output = execution_result.get("output", {})
    status = str(output.get("status", ""))
    stake = str(trace.get("entities", {}).get("stake", "target_point"))
    compaction = trace.get("entities", {}).get("compaction_degree")
    standard = gate.get("standard_value")
    representative = gate.get("representative_value")
    clauses = ", ".join(gate.get("clause_refs", []))

    if status == "PASS":
        return (
            f"{stake} compaction {compaction}% is PASS. "
            f"Representative={representative:.2f}, standard={standard:.2f}. "
            f"Clause basis: {clauses}."
        )
    if status == "OVERRIDDEN":
        return (
            f"{stake} compaction {compaction}% is OVERRIDDEN after required evidence. "
            f"Standard={standard:.2f}, please audit proof chain."
        )
    return (
        f"{stake} compaction {compaction}% is FAIL. "
        f"Representative={representative:.2f} is below standard={standard:.2f}. "
        f"Clause basis: {clauses}."
    )
