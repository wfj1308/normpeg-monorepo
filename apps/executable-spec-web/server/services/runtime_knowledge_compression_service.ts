import { randomUUID } from "node:crypto";

interface CompressionInput {
  runtime_graph: Array<Record<string, unknown>>;
  proofs: Array<Record<string, unknown>>;
  risks: Array<Record<string, unknown>>;
  anomalies: Array<Record<string, unknown>>;
}

function text(v: unknown): string {
  return String(v ?? "").trim();
}

function arr(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? v.filter((i) => i && typeof i === "object" && !Array.isArray(i)) as Array<Record<string, unknown>> : [];
}

export class RuntimeKnowledgeCompressionService {
  getSchema() {
    return {
      compression_strategy: {
        objectives: ["control graph growth", "retain traceability", "improve retrieval speed"],
        capabilities: ["semantic_clustering", "proof_deduplication", "runtime_summarization", "anomaly_abstraction"],
      },
      clustering_schema: {
        cluster_types: ["gate_pattern_cluster", "risk_cluster", "anomaly_cluster", "proof_signature_cluster"],
        keys: ["form_code", "gate_id", "risk_level", "anomaly_type", "proof_fingerprint"],
      },
      graph_optimization_rules: [
        "merge repeated gate patterns into cluster nodes",
        "deduplicate equivalent proof payloads by fingerprint",
        "summarize long runtime traces by rolling windows",
        "abstract similar anomalies to canonical anomaly classes",
      ],
      page_plan: {
        title: "Knowledge Compression Dashboard",
        sections: ["compression strategy", "clustering schema", "graph optimization rules", "compression result"],
      },
    };
  }

  compress(input: CompressionInput) {
    const runtime = arr(input.runtime_graph);
    const proofs = arr(input.proofs);
    const risks = arr(input.risks);
    const anomalies = arr(input.anomalies);

    const gatePatternMap = new Map<string, { key: string; count: number; sample: Record<string, unknown> }>();
    for (const r of runtime) {
      const key = `${text(r.form_code)}|${text(r.gate_id ?? r.gateId)}|${text(r.result ?? r.status)}`;
      const got = gatePatternMap.get(key);
      if (got) got.count += 1;
      else gatePatternMap.set(key, { key, count: 1, sample: r });
    }
    const repeatedGatePatterns = Array.from(gatePatternMap.values())
      .filter((i) => i.count >= 2)
      .map((i) => ({
        pattern_id: `gate_pattern_${randomUUID()}`,
        form_code: text(i.sample.form_code),
        gate_id: text(i.sample.gate_id ?? i.sample.gateId),
        result: text(i.sample.result ?? i.sample.status),
        occurrences: i.count,
      }));

    const proofMap = new Map<string, { count: number; sample: Record<string, unknown> }>();
    for (const p of proofs) {
      const fp = text(p.proof_fingerprint ?? `${text(p.gate_id ?? p.gateId)}|${text(p.status ?? p.proof_status)}|${text(p.hash ?? "")}`);
      const got = proofMap.get(fp);
      if (got) got.count += 1;
      else proofMap.set(fp, { count: 1, sample: p });
    }
    const dedupedProofs = Array.from(proofMap.entries()).map(([fingerprint, v]) => ({
      proof_fingerprint: fingerprint,
      merged_count: v.count,
      representative_proof_id: text(v.sample.proof_id ?? v.sample.id),
    }));

    const riskClusterMap = new Map<string, { count: number; forms: Set<string> }>();
    for (const r of risks) {
      const lv = text(r.risk_level || "unknown").toLowerCase();
      const got = riskClusterMap.get(lv) ?? { count: 0, forms: new Set<string>() };
      got.count += 1;
      got.forms.add(text(r.form_code));
      riskClusterMap.set(lv, got);
    }
    const aggregatedRisks = Array.from(riskClusterMap.entries()).map(([level, v]) => ({
      risk_cluster_id: `risk_cluster_${level}`,
      risk_level: level,
      count: v.count,
      forms: Array.from(v.forms).filter(Boolean),
    }));

    const anomalyClassMap = new Map<string, number>();
    for (const a of anomalies) {
      const cls = text(a.anomaly_type ?? "unknown").toLowerCase();
      anomalyClassMap.set(cls, (anomalyClassMap.get(cls) ?? 0) + 1);
    }
    const anomalyAbstractions = Array.from(anomalyClassMap.entries()).map(([cls, count]) => ({
      anomaly_class: cls,
      count,
      abstraction_id: `anomaly_abs_${cls}`,
    }));

    const runtimeSummary = {
      total_runtime_nodes: runtime.length,
      compressed_runtime_patterns: gatePatternMap.size,
      repeated_gate_pattern_count: repeatedGatePatterns.length,
      summary_windows: [
        { window: "latest_100", node_count: Math.min(100, runtime.length) },
        { window: "latest_500", node_count: Math.min(500, runtime.length) },
      ],
    };

    return {
      repeated_gate_patterns: repeatedGatePatterns,
      semantic_clusters: {
        gate_pattern_clusters: repeatedGatePatterns,
        risk_clusters: aggregatedRisks,
        anomaly_clusters: anomalyAbstractions,
      },
      proof_deduplication: {
        before_count: proofs.length,
        after_count: dedupedProofs.length,
        deduplicated: dedupedProofs,
      },
      runtime_summarization: runtimeSummary,
      anomaly_abstraction: anomalyAbstractions,
      optimization_effect: {
        estimated_graph_reduction_ratio: Number(((runtime.length + proofs.length) > 0
          ? 1 - ((gatePatternMap.size + dedupedProofs.length) / (runtime.length + proofs.length))
          : 0).toFixed(3)),
      },
    };
  }
}

