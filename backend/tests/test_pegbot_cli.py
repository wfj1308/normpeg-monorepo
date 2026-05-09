from __future__ import annotations

from uuid import uuid4

from backend.app.pegbot_cli import main


def _project_id(tag: str) -> str:
    return f"P-PEGBOT-CLI-{tag}-{uuid4().hex[:8]}"


def test_pegbot_ask_outputs_compact_text(capsys) -> None:
    code = main(
        [
            "ask",
            "K19+070 compaction 94.5% pass?",
            "--project-id",
            _project_id("ASK"),
        ]
    )
    captured = capsys.readouterr()
    assert code == 0
    output = captured.out
    assert output
    assert "判定结果" in output
    assert "判定原因" in output
    assert "使用规则" in output
    assert "规范依据" in output
    assert "条款原文（可展开）" in output
    assert "K19+070" in output
    assert "Proof" in output


def test_pegbot_check_status_report_roundtrip(capsys) -> None:
    project_id = _project_id("ROUNDTRIP")
    point = "K19+070"

    ask_code = main(
        [
            "ask",
            f"{point} compaction 94.5% pass?",
            "--project-id",
            project_id,
        ]
    )
    ask_output = capsys.readouterr().out
    assert ask_code == 0
    assert ask_output
    assert point in ask_output

    status_code = main(
        [
            "status",
            "--project-id",
            project_id,
            "--point",
            point,
        ]
    )
    status_output = capsys.readouterr().out
    assert status_code == 0
    assert status_output
    assert point in status_output

    report_code = main(
        [
            "report",
            "--project-id",
            project_id,
            "--point",
            point,
        ]
    )
    report_output = capsys.readouterr().out
    assert report_code == 0
    assert report_output
    assert point in report_output
    assert "Proof" in report_output


def test_pegbot_status_no_data(capsys) -> None:
    point = "K88+888"
    status_code = main(
        [
            "status",
            "--project-id",
            _project_id("EMPTY"),
            "--point",
            point,
        ]
    )
    status_output = capsys.readouterr().out
    assert status_code == 4
    assert status_output
    assert point in status_output


def test_pegbot_ask_json_outputs_full_payload(capsys) -> None:
    code = main(
        [
            "ask",
            "K19+070 compaction 94.5% pass?",
            "--project-id",
            _project_id("ASKJSON"),
            "--json",
        ]
    )
    output = capsys.readouterr().out
    assert code == 0
    assert '"answer"' in output
    assert '"execution_result"' in output


def test_pegbot_check_requires_normdoc(capsys) -> None:
    code = main(
        [
            "check",
            "--project-id",
            _project_id("CHECK_REQUIRES_NORMDOC"),
            "--point",
            "K19+070",
            "--item",
            "compaction",
            "--value",
            "94.5",
        ]
    )
    captured = capsys.readouterr()
    assert code == 1
    assert "--normdoc is required for Rule Store + Executor mode" in captured.err
