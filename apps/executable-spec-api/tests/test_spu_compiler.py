import shutil
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import app.services.spu_asset_writer as spu_asset_writer
import app.services.spu_registry as spu_registry
from main import app


client = TestClient(app)


@pytest.fixture(autouse=True)
def isolate_spu_registry(monkeypatch: pytest.MonkeyPatch) -> None:
    workspace_root = Path(__file__).resolve().parents[3]
    temp_asset_dir = workspace_root / "apps" / "executable-spec-web" / "src" / "compiled-spu" / f"test-{uuid4().hex}"
    temp_asset_dir.mkdir(parents=True, exist_ok=True)
    temp_registry_file = (
        workspace_root / "apps" / "executable-spec-api" / "data" / "runtime" / f"test-spu-registry-{uuid4().hex}.json"
    )

    monkeypatch.setattr(spu_asset_writer, "REPO_ROOT", workspace_root)
    monkeypatch.setattr(spu_asset_writer, "WEB_SPU_ASSET_DIR", temp_asset_dir)
    monkeypatch.setattr(spu_registry, "REPO_ROOT", workspace_root)
    monkeypatch.setattr(spu_registry, "SPU_REGISTRY_FILE", temp_registry_file)
    try:
        yield
    finally:
        if temp_registry_file.exists():
            temp_registry_file.unlink()
        shutil.rmtree(temp_asset_dir, ignore_errors=True)


def test_compile_compaction_normdoc_to_spu_yaml() -> None:
    payload = {
        "normDoc": {
            "norm": "JTG F80/1-2017",
            "clause": "4.2.1",
            "category": "路基工程",
            "workItem": "土方路基",
            "measuredItem": "压实度",
            "typeHint": "soil",
            "unit": "%",
            "threshold": 93,
            "testMethods": ["灌砂法", "环刀法"],
            "fields": [
                {"name": "灌入砂质量(g)", "key": "massHoleSand", "type": "number"},
                {"name": "锥体砂质量(g)", "key": "massSandCone", "type": "number"},
                {"name": "标定体积(cm³)", "key": "volumeSand", "type": "number"},
                {"name": "含水率(%)", "key": "moistureContent", "type": "number"},
                {"name": "最大干密度(g/cm³)", "key": "maxDryDensity", "type": "number"},
            ],
        }
    }

    resp = client.post("/api/v1/normdoc/compile-spu", json=payload)

    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["spuId"] == "highway.subgrade.compaction.4.2.1.soil@v1"
    assert body["registered"] is True
    assert body["registryItem"]["sourceType"] == "compiled_from_normdoc"
    assert body["registryItem"]["metricType"] == "compaction"

    registry_resp = client.get("/api/v1/spu/registry")
    assert registry_resp.status_code == 200
    registry_items = registry_resp.json()["items"]
    assert any(item["spuId"] == body["spuId"] for item in registry_items)

    asset_resp = client.get(f"/api/v1/spu/assets/{body['spuId']}")
    assert asset_resp.status_code == 200
    yaml_text = asset_resp.text
    assert 'spuId: "highway.subgrade.compaction.4.2.1.soil@v1"' in yaml_text
    assert 'name: "路基压实度（土质）"' in yaml_text
    assert 'formCode: "SUBGRADE_COMPACTION_FORM"' in yaml_text
    assert "    - name: massHoleSand" in yaml_text
    assert '    formula: "compactionDegree = (dryDensity / maxDryDensity) * 100"' in yaml_text
    assert '  - ruleId: "RULE-COMPACTION-001"' in yaml_text
    assert "    value: 93" in yaml_text
    assert '  resultField: "compactionDegree"' in yaml_text
    assert "    - supervision" in yaml_text


def test_compile_thickness_normdoc_to_spu_yaml() -> None:
    payload = {
        "normDoc": {
            "norm": "JTG F80/1-2017",
            "clause": "4.2.3",
            "category": "路基工程",
            "workItem": "土方路基",
            "measuredItem": "厚度",
            "typeHint": "soil",
            "unit": "mm",
            "threshold": 200,
            "testMethods": ["钢尺法"],
            "fields": [
                {"name": "实测厚度", "key": "actualThickness", "type": "number"},
                {"name": "设计厚度", "key": "targetThickness", "type": "number"},
            ],
        }
    }

    resp = client.post("/api/v1/normdoc/compile-spu", json=payload)

    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["spuId"] == "highway.subgrade.thickness.4.2.3@v1"
    assert body["registryItem"]["metricType"] == "thickness"

    yaml_text = client.get(f"/api/v1/spu/assets/{body['spuId']}").text
    assert 'spuId: "highway.subgrade.thickness.4.2.3@v1"' in yaml_text
    assert 'name: "路基厚度"' in yaml_text
    assert "    - name: measuredThickness" in yaml_text
    assert "    - name: designThickness" in yaml_text
    assert '    formula: "thicknessDeviation = measuredThickness - designThickness"' in yaml_text
    assert '  - ruleId: "RULE-THICKNESS-001"' in yaml_text
    assert "    value: 200" in yaml_text


def test_compile_deflection_normdoc_to_spu_yaml() -> None:
    payload = {
        "normDoc": {
            "norm": "JTG F80/1-2017",
            "clause": "4.2.2",
            "category": "路基工程",
            "workItem": "土方路基",
            "measuredItem": "弯沉",
            "typeHint": "soil",
            "unit": "0.01mm",
            "threshold": 20,
            "testMethods": ["贝克曼梁法"],
            "fields": [
                {"name": "实测弯沉", "key": "actualDeflection", "type": "number"},
                {"name": "最大允许弯沉", "key": "allowedDeflection", "type": "number"},
            ],
        }
    }

    resp = client.post("/api/v1/normdoc/compile-spu", json=payload)

    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["spuId"] == "highway.subgrade.deflection.4.2.2@v1"
    assert body["registryItem"]["metricType"] == "deflection"

    yaml_text = client.get(f"/api/v1/spu/assets/{body['spuId']}").text
    assert 'spuId: "highway.subgrade.deflection.4.2.2@v1"' in yaml_text
    assert 'name: "路基弯沉"' in yaml_text
    assert "    - name: measuredDeflection" in yaml_text
    assert "    - name: maxAllowedDeflection" in yaml_text
    assert '    value: "**INPUT**:maxAllowedDeflection"' in yaml_text
    assert '    message: "弯沉必须 ≤ 允许值"' in yaml_text


def test_compile_unsupported_metric_returns_unsupported() -> None:
    payload = {
        "normDoc": {
            "norm": "JTG F80/1-2017",
            "clause": "4.2.9",
            "category": "路基工程",
            "workItem": "土方路基",
            "measuredItem": "平整度",
            "typeHint": "soil",
            "unit": "mm",
            "threshold": 8,
            "testMethods": ["直尺法"],
            "fields": [
                {"name": "平整度", "key": "flatness", "type": "number"},
            ],
        }
    }

    resp = client.post("/api/v1/normdoc/compile-spu", json=payload)

    assert resp.status_code == 200
    assert resp.json() == {"ok": False, "error": "UNSUPPORTED_METRIC"}
