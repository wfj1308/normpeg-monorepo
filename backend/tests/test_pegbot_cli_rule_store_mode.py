from __future__ import annotations

import json
from typing import Any, Dict

from backend.app import pegbot_cli


def test_pegbot_check_rule_store_mode_uses_rule_store_and_executor(capsys, monkeypatch) -> None:
    captured_evaluate_body: Dict[str, Any] = {}

    def fake_request_platform_json(
        *,
        method: str,
        base_url: str,
        path: str,
        query: Dict[str, Any] | None = None,
        body: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        assert base_url == "http://127.0.0.1:8790"
        if path == "/api/rule-store/normdocs":
            return {
                "version": "public.v1",
                "status": "ok",
                "source": "Rule Store",
                "data": {
                    "items": [
                        {
                            "normdoc_id": "JTG-F80-2017@@v1",
                            "standard_code": "JTG-F80-2017",
                            "name": "路基路面验收规范",
                            "version": "v1",
                            "status": "published",
                        }
                    ]
                },
            }
        if path == "/api/rule-store/packages":
            assert query == {"normdoc_id": "JTG-F80-2017@@v1"}
            return {
                "version": "public.v1",
                "status": "ok",
                "source": "Rule Store",
                "data": {
                    "items": [
                        {
                            "package_id": "JTG F80/1-2017@@v1::pkg::v1",
                            "normdoc_id": "JTG-F80-2017@@v1",
                            "name": "JTG-F80 package",
                            "version": "v1",
                            "status": "published",
                        }
                    ]
                },
            }
        if path == "/api/rule-store/packages/JTG%20F80%2F1-2017%40%40v1%3A%3Apkg%3A%3Av1/rules":
            return {
                "version": "public.v1",
                "status": "ok",
                "source": "Rule Store",
                "data": {
                    "items": [
                        {
                            "rule_id": "custom.compaction.rule@v1",
                            "package_id": "JTG F80/1-2017@@v1::pkg::v1",
                            "clause": "4.2.1",
                            "item_name": "compaction",
                            "input_fields": ["compactionDegree"],
                            "enabled": True,
                            "version": "v1",
                            "status": "published",
                        }
                    ]
                },
            }
        if path == "/api/slots/import":
            assert method.upper() == "POST"
            return {
                "slot": {
                    "slotId": "slot-001",
                }
            }
        if path == "/api/containers":
            assert method.upper() == "POST"
            assert isinstance(body, dict)
            assert body.get("geoSlotRef") == "slot-001"
            return {
                "container": {
                    "containerId": "container-001",
                }
            }
        if path == "/api/executor/run":
            assert method.upper() == "POST"
            assert isinstance(body, dict)
            captured_evaluate_body.update(body)
            return {
                "status": "PASS",
                "executionId": "exec-001",
                "proof": {
                    "proofId": "proof-001",
                },
                "result": {
                    "executionId": "exec-001",
                    "passed": True,
                    "outcome": "PASS",
                    "gateStatus": "PASS",
                    "outputs": {},
                },
                "proofFragment": {
                    "proof_id": "proof-001",
                },
            }
        raise AssertionError(f"unexpected path: {path}")

    monkeypatch.setattr(pegbot_cli, "_request_platform_json", fake_request_platform_json)

    code = pegbot_cli.main(
        [
            "check",
            "--api-base",
            "http://127.0.0.1:8790",
            "--normdoc",
            "JTG-F80-2017",
            "--item",
            "compaction",
            "--point",
            "K19+070",
            "--value",
            "94.5",
            "--json",
        ]
    )

    output = capsys.readouterr().out.strip()
    assert code == 0
    assert output

    payload = json.loads(output)
    assert payload["mode"] == "rule_store_executor"
    assert payload["rule"]["rule_id"] == "custom.compaction.rule@v1"
    assert payload["rule"]["rule_version"] == "v1"
    assert payload["execution"]["status"] == "PASS"
    assert payload["execution"]["proof"]["proofId"] == "proof-001"

    # Ensure CLI forwards rule_id/rule_version from Rule Store instead of hardcoded mapping,
    # and does not inject condition/threshold/expr payload.
    assert captured_evaluate_body["rule_id"] == "custom.compaction.rule@v1"
    assert captured_evaluate_body["rule_version"] == "v1"
    assert captured_evaluate_body["context"]["container_id"] == "container-001"
    assert captured_evaluate_body["context"]["point"] == "K19+070"
    assert captured_evaluate_body["context"]["user_id"] == "did:pegbot:cli"
    assert "containerId" not in captured_evaluate_body
    assert "condition" not in captured_evaluate_body
    assert "threshold" not in captured_evaluate_body
    assert "expr" not in captured_evaluate_body
    assert captured_evaluate_body["inputs"]["compactionDegree"] == 94.5


def test_pegbot_check_rule_store_mode_prints_clause_evidence(capsys, monkeypatch) -> None:
    def fake_request_platform_json(
        *,
        method: str,
        base_url: str,
        path: str,
        query: Dict[str, Any] | None = None,
        body: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        assert base_url == "http://127.0.0.1:8790"
        if path == "/api/rule-store/normdocs":
            return {
                "data": {
                    "items": [
                        {
                            "normdoc_id": "JTG-F80-1-2017@@v1",
                            "standard_code": "JTG-F80-1-2017",
                            "name": "路基路面验收规范",
                            "version": "v1",
                            "status": "published",
                        }
                    ]
                }
            }
        if path == "/api/rule-store/packages":
            assert query == {"normdoc_id": "JTG-F80-1-2017@@v1"}
            return {
                "data": {
                    "items": [
                        {
                            "package_id": "JTG-F80-1-2017@@v1::pkg::v1",
                            "normdoc_id": "JTG-F80-1-2017@@v1",
                            "name": "JTG-F80 package",
                            "version": "v1",
                            "status": "published",
                        }
                    ]
                }
            }
        if path == "/api/rule-store/packages/JTG-F80-1-2017%40%40v1%3A%3Apkg%3A%3Av1/rules":
            return {
                "data": {
                    "items": [
                        {
                            "rule_id": "subgrade.compaction.rule@v1",
                            "package_id": "JTG-F80-1-2017@@v1::pkg::v1",
                            "clause": "4.2.1",
                            "item_name": "compaction",
                            "source_text": "压实度要求不小于93%。",
                            "input_fields": ["compactionDegree"],
                            "enabled": True,
                            "version": "v1",
                            "status": "published",
                        }
                    ]
                }
            }
        if path == "/api/slots/import":
            return {"slot": {"slotId": "slot-001"}}
        if path == "/api/containers":
            return {"container": {"containerId": "container-001"}}
        if path == "/api/executor/run":
            assert method.upper() == "POST"
            assert isinstance(body, dict)
            return {
                "result_code": "PASS",
                "status": "PASS",
                "executionId": "exec-001",
                "evidence": {
                    "standard_code": "JTG-F80-1-2017",
                    "clause_no": "4.2.1",
                    "clause_title": "路基压实度",
                    "clause_id": "clause-4.2.1",
                    "clause_content": "压实度要求不小于93%。",
                },
                "result": {
                    "gateStatus": "PASS",
                    "message": "压实度满足阈值",
                },
                "proof": {
                    "proofId": "proof-001",
                },
            }
        raise AssertionError(f"unexpected path: {path}")

    monkeypatch.setattr(pegbot_cli, "_request_platform_json", fake_request_platform_json)

    code = pegbot_cli.main(
        [
            "check",
            "--api-base",
            "http://127.0.0.1:8790",
            "--normdoc",
            "JTG-F80-1-2017",
            "--item",
            "compaction",
            "--point",
            "K19+070",
            "--value",
            "94.5",
        ]
    )
    output = capsys.readouterr().out

    assert code == 0
    assert "判定结果：合格（PASS）" in output
    assert "判定原因：压实度满足阈值" in output
    assert "使用规则：subgrade.compaction.rule@v1 @ v1" in output
    assert "规范依据：JTG-F80-1-2017 第4.2.1条 路基压实度" in output
    assert "条款原文（可展开）：压实度要求不小于93%。" in output
