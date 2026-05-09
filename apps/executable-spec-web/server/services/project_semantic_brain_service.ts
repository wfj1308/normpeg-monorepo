import { randomUUID } from "node:crypto";

interface BrainInput {
  project_id: string;
  specir: Array<Record<string, unknown>>;
  runtime: Array<Record<string, unknown>>;
  bim: Array<Record<string, unknown>>;
  iot: Array<Record<string, unknown>>;
  proof: Array<Record<string, unknown>>;
  compliance: Array<Record<string, unknown>>;
  risk: Array<Record<string, unknown>>;
  historical_memory: Array<Record<string, unknown>>;
  dependencies?: Array<Record<string, unknown>>;
}

function text(v: unknown): string {
  return String(v ?? "").trim();
}

function arr(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? v.filter((i) => i && typeof i === "object" && !Array.isArray(i)) as Array<Record<string, unknown>> : [];
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export class ProjectSemanticBrainService {
  getSchema() {
    return {
      semantic_brain_schema: {
        unified_domains: ["SpecIR", "Runtime", "BIM", "IoT", "Proof", "Compliance", "Risk", "Historical Memory"],
        core_entities: ["project", "form", "gate", "proof", "runtime_event", "bim_component", "sensor", "risk_item"],
        outputs: ["project_level_reasoning", "cross_form_dependency", "global_compliance_status"],
      },
      aggregation_engine: {
        pipeline: [
          "ingest_multisource_project_data",
          "normalize_to_project_semantic_nodes",
          "build_cross_form_dependency_edges",
          "compute_global_compliance_and_risk",
          "generate_project_level_reasoning",
        ],
        dependency_relations: ["depends_on", "impacts", "blocks", "correlates"],
      },
      reasoning_model: {
        model_type: "rule-plus-memory-hybrid",
        reasoning_dimensions: ["quality", "progress", "evidence", "risk", "trust", "cross_form_impact"],
        traceability_chain: "Body -> Gate -> Proof -> SpecIR -> normRef",
      },
      page_plan: {
        title: "Project Semantic Brain Dashboard",
        sections: [
          "semantic brain schema",
          "aggregation engine",
          "reasoning model",
          "cross-form dependency graph",
          "global compliance status",
        ],
      },
    };
  }

  build(input: BrainInput) {
    const specir = arr(input.specir);
    const runtime = arr(input.runtime);
    const bim = arr(input.bim);
    const iot = arr(input.iot);
    const proof = arr(input.proof);
    const compliance = arr(input.compliance);
    const risk = arr(input.risk);
    const memory = arr(input.historical_memory);
    const deps = arr(input.dependencies);

    const failGates = runtime.filter((r) => text(r.result ?? r.status).toUpperCase() === "FAIL");
    const missingProof = proof.filter((p) => text(p.status ?? p.proof_status).toLowerCase().includes("missing") || String(p.proof_missing ?? "").toLowerCase() === "true");
    const highRisk = risk.filter((r) => {
      const level = text(r.risk_level).toLowerCase();
      return level === "high" || level === "critical";
    });

    const totalForms = new Set(
      specir.map((i) => text(i.form_code)).concat(runtime.map((i) => text(i.form_code))).filter(Boolean),
    ).size;

    const score = clamp(
      100
        - failGates.length * 8
        - missingProof.length * 6
        - highRisk.length * 5
        + Math.min(10, memory.length * 0.4),
      0,
      100,
    );

    const globalStatus = score >= 85 ? "healthy" : score >= 65 ? "attention" : score >= 45 ? "warning" : "critical";

    const crossForm = deps.length > 0
      ? deps.map((d, idx) => ({
          edge_id: text(d.edge_id) || `dep_${idx + 1}`,
          from_form: text(d.from_form ?? d.from ?? d.source_form),
          to_form: text(d.to_form ?? d.to ?? d.target_form),
          relation: text(d.relation || "depends_on"),
          impact_weight: Number(d.impact_weight ?? 0.5),
        }))
      : failGates.slice(0, 20).map((g, idx) => ({
          edge_id: `auto_dep_${idx + 1}`,
          from_form: text(g.form_code || "unknown_form"),
          to_form: text(g.impacted_form || "project_global"),
          relation: "impacts",
          impact_weight: 0.6,
        }));

    const topIssues = [
      ...failGates.slice(0, 5).map((g) => `Gate fail: ${text(g.gate_id ?? g.gateId ?? "unknown_gate")}@${text(g.form_code || "unknown_form")}`),
      ...missingProof.slice(0, 3).map((p) => `Missing proof: ${text(p.proof_id ?? p.id ?? "unknown_proof")}`),
      ...highRisk.slice(0, 3).map((r) => `High risk: ${text(r.form_code || "unknown_form")}`),
    ];

    const projectReasoning = {
      reasoning_id: `project_reason_${randomUUID()}`,
      summary: `Project ${text(input.project_id)} semantic brain synthesized ${totalForms} forms across 8 domains.`,
      top_issues: topIssues,
      recommendations: [
        "Prioritize cross-form blockers linked to failed gates.",
        "Close missing proof evidence before final compliance.",
        "Use historical successful remediations for similar issue signatures.",
      ],
      confidence: Number(clamp(0.55 + Math.min(0.4, (specir.length + runtime.length + proof.length) / 500), 0.55, 0.95).toFixed(3)),
    };

    return {
      project_id: text(input.project_id),
      unified_counts: {
        specir: specir.length,
        runtime: runtime.length,
        bim: bim.length,
        iot: iot.length,
        proof: proof.length,
        compliance: compliance.length,
        risk: risk.length,
        historical_memory: memory.length,
        forms: totalForms,
      },
      project_level_reasoning: projectReasoning,
      cross_form_dependency: {
        edge_count: crossForm.length,
        edges: crossForm,
      },
      global_compliance_status: {
        score: Number(score.toFixed(2)),
        status: globalStatus,
        failed_gate_count: failGates.length,
        missing_proof_count: missingProof.length,
        high_risk_count: highRisk.length,
      },
      traceability: {
        required_chain: "Body -> Gate -> Proof -> SpecIR -> normRef",
      },
    };
  }
}

