from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict


def engineering_llm_schema() -> Dict[str, Any]:
    return {
        "schema_id": "engineering_llm_layer.v1",
        "training_inputs": [
            "specir",
            "slot_graph",
            "runtime_traces",
            "proof",
            "human_reviews",
            "conflict_resolutions",
        ],
        "capabilities": [
            "semantic parsing",
            "slot recommendation",
            "conflict resolution",
            "compliance reasoning",
            "runtime explanation",
        ],
        "outputs": ["model_architecture", "fine_tuning_pipeline", "retrieval_integration"],
    }


def build_engineering_llm_layer(
    *,
    specir: list[Dict[str, Any]],
    slot_graph: Dict[str, Any],
    runtime_traces: list[Dict[str, Any]],
    proof: list[Dict[str, Any]],
    human_reviews: list[Dict[str, Any]],
    conflict_resolutions: list[Dict[str, Any]],
) -> Dict[str, Any]:
    specir_rows = [x for x in specir if isinstance(x, dict)]
    trace_rows = [x for x in runtime_traces if isinstance(x, dict)]
    proof_rows = [x for x in proof if isinstance(x, dict)]
    review_rows = [x for x in human_reviews if isinstance(x, dict)]
    conflict_rows = [x for x in conflict_resolutions if isinstance(x, dict)]
    slot_nodes = slot_graph.get("nodes", []) if isinstance(slot_graph, dict) else []
    slot_node_count = len(slot_nodes) if isinstance(slot_nodes, list) else 0

    model_architecture = {
        "name": "EngineeringLLM-SemanticNative-v1",
        "base_model": "domain-adapted-llm",
        "modules": [
            {"module": "semantic_parser_head", "for": "semantic parsing"},
            {"module": "slot_recommender_head", "for": "slot recommendation"},
            {"module": "conflict_reasoner_head", "for": "conflict resolution"},
            {"module": "compliance_reasoner_head", "for": "compliance reasoning"},
            {"module": "runtime_explainer_head", "for": "runtime explanation"},
        ],
        "graph_encoder": {"enabled": True, "source": "Slot Graph"},
        "trace_encoder": {"enabled": True, "source": "Runtime traces + Proof"},
    }

    fine_tuning_pipeline = {
        "name": "engineering_llm_finetune_pipeline_v1",
        "stages": [
            "1) normalize & align SpecIR/Slot/Runtime/Proof/Review/Conflict data",
            "2) supervised fine-tuning on semantic and reasoning tasks",
            "3) preference alignment from human reviews and conflict resolutions",
            "4) evaluation on parsing/recommendation/conflict/compliance/explanation suites",
            "5) register model package and rollout",
        ],
        "dataset_stats": {
            "specir_count": len(specir_rows),
            "slot_node_count": slot_node_count,
            "runtime_trace_count": len(trace_rows),
            "proof_count": len(proof_rows),
            "human_review_count": len(review_rows),
            "conflict_resolution_count": len(conflict_rows),
        },
    }

    retrieval_integration = {
        "name": "engineering_llm_retrieval_integration_v1",
        "strategy": "hybrid semantic retrieval over SpecIR + Slot Graph + Proof traces",
        "indexes": [
            {"index": "specir_semantic_index", "source": "SpecIR"},
            {"index": "slot_graph_index", "source": "Slot Graph"},
            {"index": "runtime_proof_index", "source": "Runtime traces + Proof"},
            {"index": "review_conflict_feedback_index", "source": "Human reviews + Conflict resolutions"},
        ],
        "runtime_flow": [
            "retrieve evidence candidates",
            "rank by semantic relevance + trace confidence",
            "inject top evidence into reasoning context",
            "produce explainable answer with citations",
        ],
    }

    capabilities_status = {
        "semantic parsing": "enabled",
        "slot recommendation": "enabled",
        "conflict resolution": "enabled",
        "compliance reasoning": "enabled",
        "runtime explanation": "enabled",
    }

    return {
        "schema": engineering_llm_schema(),
        "model_architecture": model_architecture,
        "fine_tuning_pipeline": fine_tuning_pipeline,
        "retrieval_integration": retrieval_integration,
        "capabilities_status": capabilities_status,
        "meta": {
            "generated_at": _now(),
            "input_digest": {
                "specir": len(specir_rows),
                "slot_graph_nodes": slot_node_count,
                "runtime_traces": len(trace_rows),
                "proof": len(proof_rows),
                "human_reviews": len(review_rows),
                "conflict_resolutions": len(conflict_rows),
            },
        },
    }


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

