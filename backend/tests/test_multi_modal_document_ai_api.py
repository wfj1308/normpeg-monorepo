from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_layout_semantic_schema_and_analyze() -> None:
    client = TestClient(app)

    schema_resp = client.get("/api/v1/layout-semantic/schema")
    assert schema_resp.status_code == 200
    schema = schema_resp.json().get("layout_schema", {})
    assert "required_entities" in schema

    analyze_resp = client.post(
        "/api/v1/layout-semantic/analyze",
        json={
            "document_type": "pdf",
            "content_text": (
                "4 路基工程\n"
                "4.2 压实度\n"
                "允许偏差：压实度 -1%\n"
                "合并单元格：桩号范围\n"
                "compactionDegree = (dryDensity / maxDryDensity) * 100\n"
                "注：雨天工况应增加复核\n"
            ),
        },
    )
    assert analyze_resp.status_code == 200
    body = analyze_resp.json()
    assert "layout_schema" in body
    assert "ocr_fusion_strategy" in body
    assert "semantic_layout_engine" in body
    assert "layout_semantic_ir" in body
    ir = body["layout_semantic_ir"]
    assert "heading_hierarchy" in ir
    assert "tolerance_tables" in ir
    assert "merged_cells" in ir
    assert "formula_regions" in ir
    assert "annotations" in ir

    for key in ["heading_hierarchy", "tolerance_tables", "merged_cells", "formula_regions", "annotations"]:
        items = ir.get(key) or []
        if items:
            first = items[0]
            assert "bbox" in first
            assert "evidence_span" in first

