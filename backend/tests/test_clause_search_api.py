from __future__ import annotations

from fastapi.testclient import TestClient

import backend.app.main as main_module
from backend.app.main import app


def test_clause_search_supports_title_keyword_and_content_matching() -> None:
    client = TestClient(app)

    by_title = client.get(
        "/api/clauses/search",
        params={"q": "压实度", "standard_code": "JTG-F80-1-2017", "version": "v1"},
    )
    assert by_title.status_code == 200
    payload = by_title.json()
    assert payload["query"] == "压实度"
    assert payload["results"]
    first = payload["results"][0]
    assert first["clause_id"] == "4.2.1"
    assert first["clause_no"] == "4.2.1"
    assert first["title"] == "路基压实度"
    assert first["standard_code"] == "JTG-F80-1-2017"
    assert first["version"] == "v1"
    assert 0.0 < float(first["score"]) <= 1.0

    by_keyword = client.get(
        "/api/clauses/search",
        params={"q": "实测项目", "standard_code": "JTG-F80-1-2017", "version": "v1"},
    )
    assert by_keyword.status_code == 200
    keyword_payload = by_keyword.json()
    assert any(item["clause_no"] == "4.2.1" for item in keyword_payload["results"])

    by_content = client.get(
        "/api/clauses/search",
        params={"q": "代表值判定", "standard_code": "JTG-F80-1-2017", "version": "v1"},
    )
    assert by_content.status_code == 200
    content_payload = by_content.json()
    assert any(item["clause_no"] == "4.2.1" for item in content_payload["results"])

    by_clause_no = client.get(
        "/api/clauses/search",
        params={"q": "4.2.1", "standard_code": "JTG-F80-1-2017", "version": "v1"},
    )
    assert by_clause_no.status_code == 200
    by_clause_no_payload = by_clause_no.json()
    assert by_clause_no_payload["results"]
    assert by_clause_no_payload["results"][0]["clause_no"] == "4.2.1"


def test_clause_search_supports_standard_code_and_version_filters() -> None:
    client = TestClient(app)
    response = client.get(
        "/api/clauses/search",
        params={"q": "压实度", "standard_code": "JTG-F80-1-2017", "version": "v9"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["query"] == "压实度"
    assert payload["results"] == []


def test_clause_search_does_not_return_unpublished_clauses() -> None:
    client = TestClient(app)
    parse_id = "parse_unpublished_clause_search_case"
    main_module.pdf_parse_runtime_store[parse_id] = {
        "parseId": parse_id,
        "status": "success",
        "extractedData": {
            "metadata": {
                "standardCode": "JTG-F80-1-2017",
                "version": "v1",
                "publishStatus": "draft",
            },
            "chapters": [
                {
                    "id": "9",
                    "title": "草稿章节",
                    "clauses": [
                        {
                            "id": "9.9.9",
                            "clause": "9.9.9",
                            "title": "草稿压实度",
                            "content": "压实度草稿，不应被检索返回。",
                            "keywords": ["压实度", "草稿"],
                        }
                    ],
                }
            ],
        },
    }

    try:
        response = client.get(
            "/api/clauses/search",
            params={"q": "压实度", "standard_code": "JTG-F80-1-2017", "version": "v1"},
        )
        assert response.status_code == 200
        payload = response.json()
        clause_ids = [item["clause_no"] for item in payload["results"]]
        assert "9.9.9" not in clause_ids
    finally:
        main_module.pdf_parse_runtime_store.pop(parse_id, None)


def test_clause_includes_explain_fields_and_notice() -> None:
    client = TestClient(app)
    response = client.get(
        "/api/clauses/search",
        params={"q": "4.2.1", "standard_code": "JTG-F80-1-2017", "version": "v1"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["results"]
    first = payload["results"][0]
    assert first["clause_no"] == "4.2.1"
    assert "explanation" in first
    assert "risk_note" in first
    assert "related_terms" in first
    assert "generated_by_ai" in first
    assert "marked_reviewed" in first
    assert first["explanation_notice"] == "辅助说明，不作为判定依据"


def test_clause_explain_generate_and_review_keeps_content_unchanged() -> None:
    client = TestClient(app)
    main_module.clause_explain_runtime_store.clear()

    baseline = client.get(
        "/api/clauses/search",
        params={"q": "4.2.1", "standard_code": "JTG-F80-1-2017", "version": "v1"},
    )
    assert baseline.status_code == 200
    baseline_clause = baseline.json()["results"][0]
    baseline_content = baseline_clause["content"]

    generate = client.post(
        "/api/clauses/4.2.1/explain/generate",
        json={"normdoc_id": "JTG-F80-1-2017", "version": "v1"},
    )
    assert generate.status_code == 200
    generated_payload = generate.json()
    assert generated_payload["status"] == "generated"
    generated_clause = generated_payload["clause"]
    assert generated_clause["generated_by_ai"] is True
    assert generated_clause["marked_reviewed"] is False
    assert isinstance(generated_clause.get("explanation"), str) and generated_clause["explanation"]
    assert generated_clause["content"] == baseline_content

    review = client.post(
        "/api/clauses/4.2.1/explain/review",
        json={
            "normdoc_id": "JTG-F80-1-2017",
            "version": "v1",
            "explanation": "人工确认：本条用于解释压实度验收边界。",
            "risk_note": "人工确认：不满足会导致对应检验项不通过。",
            "related_terms": ["压实度", "路基", "代表值"],
            "marked_reviewed": True,
        },
    )
    assert review.status_code == 200
    reviewed_payload = review.json()
    reviewed_clause = reviewed_payload["clause"]
    assert reviewed_payload["status"] == "reviewed"
    assert reviewed_clause["generated_by_ai"] is True
    assert reviewed_clause["marked_reviewed"] is True
    assert reviewed_clause["explanation"] == "人工确认：本条用于解释压实度验收边界。"
    assert reviewed_clause["risk_note"] == "人工确认：不满足会导致对应检验项不通过。"
    assert reviewed_clause["related_terms"] == ["压实度", "路基", "代表值"]
    assert reviewed_clause["content"] == baseline_content

    search_again = client.get(
        "/api/clauses/search",
        params={"q": "4.2.1", "standard_code": "JTG-F80-1-2017", "version": "v1"},
    )
    assert search_again.status_code == 200
    searched_clause = search_again.json()["results"][0]
    assert searched_clause["marked_reviewed"] is True
    assert searched_clause["explanation"] == "人工确认：本条用于解释压实度验收边界。"
    assert searched_clause["content"] == baseline_content


def test_clause_neighbors_returns_previous_and_next_by_clause_no_order() -> None:
    client = TestClient(app)
    response = client.get(
        "/api/clauses/4.2.2/neighbors",
        params={"normdoc_id": "JTG-F80-1-2017", "version": "v1"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["current"]["clause_no"] == "4.2.2"
    assert payload["current"]["normdoc_id"] == "JTG-F80-1-2017"
    assert payload["current"]["version"] == "v1"
    assert payload["previous"]["clause_no"] == "4.2.1"
    assert payload["next"]["clause_no"] == "4.2.3"


def test_clause_neighbors_supports_normdoc_and_version_scope() -> None:
    client = TestClient(app)
    parse_id = "parse_clause_neighbors_scope_case"
    main_module.pdf_parse_runtime_store[parse_id] = {
        "parseId": parse_id,
        "status": "success",
        "extractedData": {
            "metadata": {
                "standardCode": "JTG-TEST-1-2024",
                "normdocId": "JTG-TEST-1-2024@@v9",
                "version": "v9",
                "publishStatus": "published",
            },
            "chapters": [
                {
                    "id": "5",
                    "title": "测试章节",
                    "clauses": [
                        {"id": "5.1.1", "clause": "5.1.1", "title": "A", "content": "A条款", "normdoc_id": "JTG-TEST-1-2024@@v9"},
                        {"id": "5.1.2", "clause": "5.1.2", "title": "B", "content": "B条款", "normdoc_id": "JTG-TEST-1-2024@@v9"},
                        {"id": "5.1.10", "clause": "5.1.10", "title": "C", "content": "C条款", "normdoc_id": "JTG-TEST-1-2024@@v9"},
                    ],
                }
            ],
        },
    }
    try:
        scoped_response = client.get(
            "/api/clauses/5.1.2/neighbors",
            params={"normdoc_id": "JTG-TEST-1-2024@@v9", "version": "v9"},
        )
        assert scoped_response.status_code == 200
        scoped_payload = scoped_response.json()
        assert scoped_payload["current"]["clause_no"] == "5.1.2"
        assert scoped_payload["previous"]["clause_no"] == "5.1.1"
        assert scoped_payload["next"]["clause_no"] == "5.1.10"

        wrong_version = client.get(
            "/api/clauses/5.1.2/neighbors",
            params={"normdoc_id": "JTG-TEST-1-2024@@v9", "version": "v8"},
        )
        assert wrong_version.status_code == 404
    finally:
        main_module.pdf_parse_runtime_store.pop(parse_id, None)


def test_clause_semantic_search_returns_clause_id_and_score() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/clauses/semantic-search",
        json={
            "query": "4.2.1 压实度不够怎么办",
            "standard_code": "JTG-F80-1-2017",
            "version": "v1",
            "limit": 5,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["query"] == "4.2.1 压实度不够怎么办"
    assert payload["search_type"] == "semantic"
    assert payload["vector_backend"] in {"memory"}
    assert payload["results"]
    first = payload["results"][0]
    assert first["clause_id"]
    assert first["clause_no"]
    assert first["standard_code"] == "JTG-F80-1-2017"
    assert first["version"] == "v1"
    assert 0.0 < float(first["score"]) <= 1.0


def test_clause_semantic_search_supports_version_filter() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/clauses/semantic-search",
        json={
            "query": "4.2.1 压实度不够怎么办",
            "standard_code": "JTG-F80-1-2017",
            "version": "v9",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["results"] == []


def test_clause_semantic_search_does_not_return_unpublished_clauses() -> None:
    client = TestClient(app)
    parse_id = "parse_unpublished_clause_semantic_search_case"
    main_module.pdf_parse_runtime_store[parse_id] = {
        "parseId": parse_id,
        "status": "success",
        "extractedData": {
            "metadata": {
                "standardCode": "JTG-F80-1-2017",
                "version": "v1",
                "publishStatus": "draft",
            },
            "chapters": [
                {
                    "id": "9",
                    "title": "草稿章节",
                    "clauses": [
                        {
                            "id": "9.9.9",
                            "clause": "9.9.9",
                            "title": "草稿压实度条款",
                            "content": "草稿语义检索测试内容，不应出现在已发布检索结果中。",
                            "keywords": ["压实度", "草稿"],
                        }
                    ],
                }
            ],
        },
    }
    try:
        response = client.post(
            "/api/clauses/semantic-search",
            json={
                "query": "草稿压实度条款",
                "standard_code": "JTG-F80-1-2017",
                "version": "v1",
            },
        )
        assert response.status_code == 200
        payload = response.json()
        clause_ids = [str(item.get("clause_no") or "") for item in payload["results"]]
        assert "9.9.9" not in clause_ids
    finally:
        main_module.pdf_parse_runtime_store.pop(parse_id, None)


def test_clause_hybrid_search_returns_final_score_without_debug_breakdown() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/clauses/hybrid-search",
        json={
            "query": "4.2.1",
            "standard_code": "JTG-F80-1-2017",
            "version": "v1",
            "limit": 5,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["query"] == "4.2.1"
    assert payload["search_type"] == "hybrid"
    assert payload["weights"] == {
        "keyword_score": 0.4,
        "semantic_score": 0.4,
        "rule_binding_weight": 0.2,
    }
    assert payload["results"]
    first = payload["results"][0]
    assert first["clause_id"]
    assert 0.0 < float(first["score"]) <= 1.0
    assert "score_debug" not in first


def test_clause_hybrid_search_debug_mode_includes_score_breakdown() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/clauses/hybrid-search",
        json={
            "query": "4.2.1",
            "standard_code": "JTG-F80-1-2017",
            "version": "v1",
            "limit": 5,
            "debug": True,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload.get("debug"), dict)
    assert payload["debug"]["rule_binding_priority_enabled"] is True
    first = payload["results"][0]
    breakdown = first.get("score_debug")
    assert isinstance(breakdown, dict)
    assert set(breakdown).issuperset(
        {
            "keyword_score",
            "semantic_score",
            "clause_priority",
            "rule_binding_weight",
            "rule_binding_count",
            "final_score",
            "formula",
        }
    )


def test_clause_hybrid_search_prioritizes_rule_bound_clause() -> None:
    client = TestClient(app)
    parse_id = "parse_hybrid_search_rule_priority_case"
    original_spu_runtime_store = dict(main_module.spu_runtime_store)
    main_module.pdf_parse_runtime_store[parse_id] = {
        "parseId": parse_id,
        "status": "success",
        "extractedData": {
            "metadata": {
                "standardCode": "JTG-HYBRID-TEST-2026",
                "normdocId": "JTG-HYBRID-TEST-2026@@v1",
                "version": "v1",
                "publishStatus": "published",
            },
            "chapters": [
                {
                    "id": "8",
                    "title": "Hybrid test chapter",
                    "clauses": [
                        {
                            "id": "8.1.1",
                            "clause": "8.1.1",
                            "title": "Compaction handling guidance A",
                            "content": "When compaction is below threshold, perform remediation and re-check.",
                            "keywords": ["compaction", "remediation", "re-check"],
                        },
                        {
                            "id": "8.1.2",
                            "clause": "8.1.2",
                            "title": "Compaction handling guidance B",
                            "content": "When compaction is below threshold, perform remediation and re-check.",
                            "keywords": ["compaction", "remediation", "re-check"],
                        },
                    ],
                }
            ],
        },
    }
    main_module.spu_runtime_store.clear()
    main_module.spu_runtime_store["spu.hybrid.bound@v1"] = {
        "manifest": {
            "spuId": "spu.hybrid.bound@v1",
            "clauseId": "8.1.2",
            "gate": {
                "rules": [
                    {"ruleId": "RULE-HYBRID-001"},
                    {"ruleId": "RULE-HYBRID-002"},
                ]
            },
        }
    }
    try:
        response = client.post(
            "/api/clauses/hybrid-search",
            json={
                "query": "compaction remediation re-check",
                "standard_code": "JTG-HYBRID-TEST-2026",
                "version": "v1",
                "limit": 5,
                "debug": True,
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["results"]
        first = payload["results"][0]
        assert first["clause_no"] == "8.1.2"
        assert first["score_debug"]["rule_binding_count"] >= 1
        assert float(first["score_debug"]["rule_binding_weight"]) > 0.0
    finally:
        main_module.pdf_parse_runtime_store.pop(parse_id, None)
        main_module.spu_runtime_store.clear()
        main_module.spu_runtime_store.update(original_spu_runtime_store)
