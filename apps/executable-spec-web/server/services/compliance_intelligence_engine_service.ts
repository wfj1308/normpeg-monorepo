import { randomUUID } from "node:crypto";

interface ComplianceIntelligenceInput {
  runtime_graph: Array<Record<string, unknown>>;
  proof_chain: Array<Record<string, unknown>>;
  risk_events: Array<Record<string, unknown>>;
  override_history: Array<Record<string, unknown>>;
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

export class ComplianceIntelligenceEngineService {
  getSchema() {
    return {
      compliance_intelligence_schema: {
        input: ["runtime_graph", "proof_chain", "risk_events", "override_history"],
        output: ["compliance_score", "risk_clusters", "suspicious_patterns", "unverifiable_areas", "predicted_failures"],
        levels: ["form_level", "bridge_level", "project_level"],
      },
      clustering_engine: {
        strategy: "rule_based_density_clustering",
        dimensions: ["risk_level", "failed_gate_frequency", "proof_missing_ratio", "override_frequency", "form_bridge_proximity"],
        high_risk_cluster_policy: "must_generate_investigation_recommendation",
      },
      page_plan: {
        title: "Compliance Intelligence Center",
        sections: [
          "compliance intelligence schema",
          "clustering engine",
          "multi-level compliance score",
          "risk clusters",
          "suspicious patterns",
          "unverifiable areas",
          "predicted failures",
        ],
      },
    };
  }

  analyze(input: ComplianceIntelligenceInput) {
    const runtime = arr(input.runtime_graph);
    const proof = arr(input.proof_chain);
    const risks = arr(input.risk_events);
    const overrides = arr(input.override_history);

    const forms = Array.from(new Set(runtime.map((i) => text(i.form_code)).filter(Boolean)));
    const bridges = Array.from(new Set(runtime.map((i) => text(i.bridge_section ?? i.bridge_id)).filter(Boolean)));

    const failedGates = runtime.filter((r) => text(r.result ?? r.status).toUpperCase() === "FAIL");
    const missingProof = proof.filter((p) => {
      const s = text(p.proof_status ?? p.status).toLowerCase();
      return s.includes("missing") || s.includes("incomplete") || String(p.proof_missing ?? "").toLowerCase() === "true";
    });
    const highRisk = risks.filter((r) => {
      const lv = text(r.risk_level).toLowerCase();
      return lv === "high" || lv === "critical";
    });
    const overrideBursts = overrides.filter((o) => text(o.event_type ?? "manual_override").toLowerCase().includes("override"));

    const formLevel = forms.map((formCode) => {
      const rf = runtime.filter((i) => text(i.form_code) === formCode);
      const pf = proof.filter((i) => text(i.form_code) === formCode);
      const of = overrides.filter((i) => text(i.form_code) === formCode);
      const fails = rf.filter((i) => text(i.result ?? i.status).toUpperCase() === "FAIL").length;
      const miss = pf.filter((i) => {
        const s = text(i.proof_status ?? i.status).toLowerCase();
        return s.includes("missing") || s.includes("incomplete") || String(i.proof_missing ?? "").toLowerCase() === "true";
      }).length;
      const score = clamp(100 - fails * 10 - miss * 8 - of.length * 2, 0, 100);
      return { form_code: formCode, score: Number(score.toFixed(2)), failed_gate_count: fails, missing_proof_count: miss, override_count: of.length };
    });

    const bridgeLevel = bridges.map((bridgeId) => {
      const rr = runtime.filter((i) => text(i.bridge_section ?? i.bridge_id) === bridgeId);
      const formsInBridge = new Set(rr.map((i) => text(i.form_code)).filter(Boolean));
      const fail = rr.filter((i) => text(i.result ?? i.status).toUpperCase() === "FAIL").length;
      const score = clamp(100 - fail * 7 - formsInBridge.size * 1.2, 0, 100);
      return { bridge_id: bridgeId, score: Number(score.toFixed(2)), forms: Array.from(formsInBridge), failed_gate_count: fail };
    });

    const projectScore = clamp(
      100
      - failedGates.length * 6
      - missingProof.length * 5
      - highRisk.length * 4
      - overrideBursts.length * 1.5,
      0,
      100,
    );

    const riskClusters = [
      {
        cluster_id: `risk_cluster_${randomUUID()}`,
        severity: highRisk.length > 4 ? "critical" : highRisk.length > 1 ? "high" : "medium",
        forms: Array.from(new Set(highRisk.map((i) => text(i.form_code)).filter(Boolean))),
        indicators: {
          high_risk_events: highRisk.length,
          failed_gates: failedGates.length,
          missing_proofs: missingProof.length,
          override_bursts: overrideBursts.length,
        },
        investigation_recommendation: [
          "Inspect root causes for repeated failed gates within the cluster.",
          "Verify proof completeness and signer integrity for impacted forms.",
          "Audit override approvals and operator behavior in the same timeframe.",
        ],
      },
    ];

    const suspiciousPatterns = [
      ...(overrideBursts.length >= 3 ? [{
        pattern_type: "repeated_overrides",
        evidence: { override_count: overrideBursts.length },
        confidence: Number(clamp(0.6 + overrideBursts.length * 0.04, 0.6, 0.92).toFixed(3)),
      }] : []),
      ...(failedGates.length >= 3 ? [{
        pattern_type: "gate_fail_burst",
        evidence: { fail_count: failedGates.length },
        confidence: Number(clamp(0.58 + failedGates.length * 0.03, 0.58, 0.9).toFixed(3)),
      }] : []),
    ];

    const unverifiableAreas = missingProof.slice(0, 20).map((p, index) => ({
      area_id: `unverifiable_${index + 1}`,
      form_code: text(p.form_code || "unknown_form"),
      gate_id: text(p.gate_id ?? p.gateId ?? "unknown_gate"),
      proof_id: text(p.proof_id ?? p.id ?? "unknown_proof"),
      reason: text(p.reason ?? p.proof_status ?? "missing_or_incomplete_proof"),
    }));

    const predictedFailures = highRisk.slice(0, 10).map((r, index) => ({
      prediction_id: `ci_pred_${index + 1}`,
      form_code: text(r.form_code || "unknown_form"),
      gate_id: text(r.gate_id ?? r.gateId ?? "default_gate"),
      risk_probability: Number(clamp(Number(r.risk_score ?? 0.68), 0.3, 0.98).toFixed(3)),
      confidence: Number(clamp(0.55 + failedGates.length * 0.02, 0.55, 0.9).toFixed(3)),
    }));

    return {
      compliance_score: {
        form_level: formLevel,
        bridge_level: bridgeLevel,
        project_level: {
          score: Number(projectScore.toFixed(2)),
          status: projectScore >= 85 ? "healthy" : projectScore >= 65 ? "attention" : projectScore >= 45 ? "warning" : "critical",
        },
      },
      risk_clusters: riskClusters,
      suspicious_patterns: suspiciousPatterns,
      unverifiable_areas: unverifiableAreas,
      predicted_failures: predictedFailures,
    };
  }
}

