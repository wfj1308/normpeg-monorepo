from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_knowledge_graph_build_and_queries() -> None:
    client = TestClient(app)

    build_resp = client.post(
        "/api/v1/knowledge-graph/build",
        json={
            "specs": [
                {
                    "spec_id": "JTG_F80_1_2017.4.2.1.compaction",
                    "version": "v1",
                    "semantics": {"standard_id": "JTG_F80_1_2017", "clause_refs": ["4.2.1"]},
                    "inputs": {"input_dto": {"compaction_degree": {"type": "number", "unit": "%"}}},
                    "gate": {"rules": [{"rule_id": "r.compaction", "field": "compaction_degree", "operator": ">=", "threshold": 95, "unit": "%"}]},
                }
            ]
        },
    )
    assert build_resp.status_code == 200
    build_body = build_resp.json()
    assert "schema" in build_body
    assert "nodes" in build_body
    assert "edges" in build_body
    node_types = {str(n.get("type")) for n in build_body.get("nodes", []) if isinstance(n, dict)}
    for t in ["Clause", "SpecIR", "Slot", "Rule", "Gate", "Runtime", "Proof", "Form", "DTO", "Executor"]:
        assert t in node_types
    edge_types = {str(e.get("type")) for e in build_body.get("edges", []) if isinstance(e, dict)}
    for t in ["derives", "validates", "impacts"]:
        assert t in edge_types

    query_resp = client.post("/api/v1/knowledge-graph/query", json={"node_type": "Slot", "keyword": "compaction"})
    assert query_resp.status_code == 200
    assert "nodes" in query_resp.json()

    traverse_resp = client.post("/api/v1/knowledge-graph/traverse", json={"start_node_id": "slot:compaction_degree", "max_depth": 3})
    assert traverse_resp.status_code == 200
    assert "visited" in traverse_resp.json()

    semantic_resp = client.post("/api/v1/knowledge-graph/semantic-search", json={"query": "compaction", "limit": 10})
    assert semantic_resp.status_code == 200
    assert "items" in semantic_resp.json()

    slot_usage_resp = client.get("/api/v1/knowledge-graph/slot-usage", params={"slotKey": "compaction_degree"})
    assert slot_usage_resp.status_code == 200
    body = slot_usage_resp.json()
    assert "standards" in body
    assert "specirs" in body
    assert "full_chain_impact" in body

    schema_resp = client.get("/api/v1/knowledge-graph/schema")
    assert schema_resp.status_code == 200
    assert "graph_schema" in schema_resp.json()

    rt_resp = client.get("/api/v1/knowledge-graph/runtime-trace", params={"slotKey": "compaction_degree", "max_depth": 6})
    assert rt_resp.status_code == 200
    assert "full_chain_impact" in rt_resp.json()

    ai_ret_resp = client.post("/api/v1/knowledge-graph/ai-retrieval", json={"query": "compaction", "limit": 10})
    assert ai_ret_resp.status_code == 200
    ai_ret_body = ai_ret_resp.json()
    assert "retrieval_items" in ai_ret_body
    assert "semantic_query_engine" in ai_ret_body
