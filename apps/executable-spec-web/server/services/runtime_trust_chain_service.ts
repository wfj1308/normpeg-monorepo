import { randomUUID } from "node:crypto";

export type TrustLevel = "trusted" | "review_required" | "suspicious" | "untrusted";

export interface RuntimeTrustEvaluatePayload {
  project_id: string;
  source: Record<string, unknown>;
  device: Record<string, unknown>;
  manual_input: Record<string, unknown>;
  proof: Record<string, unknown>;
  runtime_events: Array<Record<string, unknown>>;
  recent_values: number[];
}

interface TrustSnapshot {
  report_id: string;
  created_at: string;
  project_id: string;
  trust_score: number;
  trust_level: TrustLevel;
  low_trust_proofs: Array<Record<string, unknown>>;
  suspicious_overrides: Array<Record<string, unknown>>;
  missing_evidence: string[];
  auto_final_allowed: boolean;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function isTrue(value: unknown): boolean {
  return value === true || String(value ?? "").trim().toLowerCase() === "true";
}

function toNumArray(values: number[]): number[] {
  return Array.isArray(values) ? values.filter((v) => Number.isFinite(v)).map((v) => Number(v)) : [];
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length;
  return Math.sqrt(variance);
}

function trustLevelFromScore(score: number): TrustLevel {
  if (score >= 85) return "trusted";
  if (score >= 70) return "review_required";
  if (score >= 50) return "suspicious";
  return "untrusted";
}

export class RuntimeTrustChainService {
  private readonly history: TrustSnapshot[] = [];

  getSchema() {
    return {
      trust_scoring_model: {
        factors: {
          sensor_calibration: { weight: 0.25, source: "device.calibration_status" },
          operator_signature: { weight: 0.2, source: "manual_input.signed + proof.signatures" },
          proof_completeness: { weight: 0.2, source: "proof.complete + required evidence" },
          override_frequency: { weight: 0.15, source: "runtime_events.manual_override ratio" },
          anomaly_detection: { weight: 0.2, source: "recent_values + runtime_events.anomaly" },
        },
        score_range: [0, 100],
      },
      trust_levels: ["trusted", "review_required", "suspicious", "untrusted"],
      trust_lifecycle: [
        "ingest_runtime_signals",
        "compute_factor_scores",
        "derive_trust_level",
        "gate_final_compliance",
        "queue_manual_review_if_needed",
      ],
      policy: {
        untrusted_auto_final_compliance: "forbidden",
      },
      page_plan: {
        dashboard: "Trust Dashboard",
        sections: ["low trust proofs", "suspicious overrides", "missing evidence", "trust trend"],
      },
    };
  }

  evaluate(payload: RuntimeTrustEvaluatePayload) {
    const calibrationRaw = String(payload.device?.calibration_status ?? "").trim().toLowerCase();
    const calibrationScore = calibrationRaw === "valid" || calibrationRaw === "calibrated" ? 100 : calibrationRaw ? 45 : 20;

    const proofSignatures = Array.isArray(payload.proof?.signatures) ? payload.proof.signatures : [];
    const signedByManual = isTrue(payload.manual_input?.signed);
    const signatureScore = signedByManual || proofSignatures.length > 0 ? 100 : 35;

    const evidence = payload.proof?.evidence_chain;
    const evidenceObj = evidence && typeof evidence === "object" ? evidence as Record<string, unknown> : {};
    const missingEvidence: string[] = [];
    if (!isTrue(payload.proof?.complete)) missingEvidence.push("proof.complete=false");
    if (!String(evidenceObj.standard_code ?? "").trim()) missingEvidence.push("evidence.standard_code missing");
    if (!String(evidenceObj.clause_id ?? "").trim()) missingEvidence.push("evidence.clause_id missing");
    const completenessScore = clamp(100 - missingEvidence.length * 25, 0, 100);

    const events = Array.isArray(payload.runtime_events) ? payload.runtime_events : [];
    const overrideEvents = events.filter((e) => String(e.event_type ?? "").trim().toLowerCase() === "manual_override");
    const overrideFreq = events.length > 0 ? overrideEvents.length / events.length : 0;
    const overrideScore = clamp(Math.round(100 - overrideFreq * 160), 0, 100);

    const values = toNumArray(payload.recent_values ?? []);
    const sigma = stdDev(values);
    const eventAnomalyCount = events.filter((e) => isTrue((e as Record<string, unknown>).anomaly)).length;
    const anomalyPenalty = clamp(Math.round(sigma * 18 + eventAnomalyCount * 18), 0, 95);
    const anomalyScore = clamp(100 - anomalyPenalty, 5, 100);

    const finalScore = Math.round(
      calibrationScore * 0.25
      + signatureScore * 0.2
      + completenessScore * 0.2
      + overrideScore * 0.15
      + anomalyScore * 0.2,
    );

    const trustLevel = trustLevelFromScore(finalScore);
    const lowTrustProofs = finalScore < 70
      ? [{ proof_id: String(payload.proof?.proof_id ?? payload.proof?.proofId ?? "unknown"), trust_score: finalScore, trust_level: trustLevel }]
      : [];
    const suspiciousOverrides = overrideFreq > 0.2
      ? overrideEvents.map((item, index) => ({
        event_id: String(item.event_id ?? `override_${index + 1}`),
        gate_id: String(item.gate_id ?? "unknown"),
        operator: String(item.operator ?? payload.manual_input?.signer ?? "unknown"),
      }))
      : [];

    const reportId = `trust_${randomUUID()}`;
    const createdAt = new Date().toISOString();
    const autoFinalAllowed = trustLevel !== "untrusted";

    const report = {
      report_id: reportId,
      created_at: createdAt,
      project_id: payload.project_id,
      trust_score: finalScore,
      trust_level: trustLevel,
      factor_scores: {
        sensor_calibration: calibrationScore,
        operator_signature: signatureScore,
        proof_completeness: completenessScore,
        override_frequency: overrideScore,
        anomaly_detection: anomalyScore,
      },
      low_trust_proofs: lowTrustProofs,
      suspicious_overrides: suspiciousOverrides,
      missing_evidence: missingEvidence,
      compliance_gate: {
        auto_final_allowed: autoFinalAllowed,
        reason: autoFinalAllowed ? "trust policy allows auto-final" : "untrusted runtime data blocks auto final compliance",
      },
      trust_lifecycle: {
        state: autoFinalAllowed ? "queue_manual_review_if_needed" : "gate_final_compliance",
        next_action: autoFinalAllowed ? "continue_with_review_policy" : "manual_review_required_before_final",
      },
    };

    this.history.unshift({
      report_id: reportId,
      created_at: createdAt,
      project_id: payload.project_id,
      trust_score: finalScore,
      trust_level: trustLevel,
      low_trust_proofs: lowTrustProofs,
      suspicious_overrides: suspiciousOverrides,
      missing_evidence: missingEvidence,
      auto_final_allowed: autoFinalAllowed,
    });
    if (this.history.length > 500) {
      this.history.length = 500;
    }

    return {
      trust_score_rules: this.getSchema().trust_scoring_model,
      trust_report_schema: {
        report_id: "string",
        trust_score: "0..100",
        trust_level: "trusted|review_required|suspicious|untrusted",
        factor_scores: "object",
        low_trust_proofs: "array",
        suspicious_overrides: "array",
        missing_evidence: "array",
        compliance_gate: "object",
      },
      trust_report: report,
    };
  }

  getDashboard(limit = 100) {
    const items = this.history.slice(0, Math.max(1, Math.min(500, limit)));
    return {
      items,
      low_trust_proofs: items.flatMap((item) => item.low_trust_proofs),
      suspicious_overrides: items.flatMap((item) => item.suspicious_overrides),
      missing_evidence: items.flatMap((item) => item.missing_evidence.map((e) => ({ report_id: item.report_id, evidence: e }))),
      trust_distribution: {
        trusted: items.filter((i) => i.trust_level === "trusted").length,
        review_required: items.filter((i) => i.trust_level === "review_required").length,
        suspicious: items.filter((i) => i.trust_level === "suspicious").length,
        untrusted: items.filter((i) => i.trust_level === "untrusted").length,
      },
    };
  }

  finalizeCompliance(payload: { report_id: string; requested_by?: string }) {
    const reportId = String(payload.report_id ?? "").trim();
    if (!reportId) {
      throw new Error("report_id is required");
    }
    const found = this.history.find((item) => item.report_id === reportId);
    if (!found) {
      throw new Error("trust report not found");
    }
    if (!found.auto_final_allowed) {
      return {
        allowed: false,
        status: "blocked",
        reason: "untrusted runtime data cannot auto-generate final compliance",
        trust_level: found.trust_level,
        trust_score: found.trust_score,
      };
    }
    return {
      allowed: true,
      status: "approved",
      reason: "trust policy passed",
      trust_level: found.trust_level,
      trust_score: found.trust_score,
      finalized_at: new Date().toISOString(),
      requested_by: String(payload.requested_by ?? "system"),
    };
  }
}
