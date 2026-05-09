import { createHash, randomUUID } from "node:crypto";

interface CrossProjectInput {
  source_project_id: string;
  target_project_id: string;
  successful_remediation: Array<Record<string, unknown>>;
  runtime_anomaly_patterns: Array<Record<string, unknown>>;
  semantic_mappings: Array<Record<string, unknown>>;
  gate_tuning_knowledge: Array<Record<string, unknown>>;
}

function text(v: unknown): string {
  return String(v ?? "").trim();
}

function arr(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? v.filter((i) => i && typeof i === "object" && !Array.isArray(i)) as Array<Record<string, unknown>> : [];
}

function hashId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function anonymizeRecord(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    const key = k.toLowerCase();
    if (key.includes("name") || key.includes("phone") || key.includes("email") || key.includes("idcard") || key.includes("operator")) {
      out[k] = typeof v === "string" ? `anon_${hashId(v)}` : "anon_masked";
      continue;
    }
    if (key.includes("project_id") || key.includes("project")) {
      out[k] = "project_masked";
      continue;
    }
    out[k] = v;
  }
  return out;
}

export class CrossProjectSemanticLearningService {
  getSchema() {
    return {
      transfer_learning_schema: {
        shared_knowledge_types: [
          "successful_remediation",
          "runtime_anomaly_patterns",
          "semantic_mappings",
          "gate_tuning_knowledge",
        ],
        transfer_modes: ["pattern_transfer", "parameter_transfer", "mapping_transfer", "policy_transfer"],
        output: ["transfer_pack", "semantic_transfer_recommendations", "confidence"],
      },
      anonymization_strategy: {
        pii_masking: ["operator", "name", "phone", "email", "idcard"],
        project_masking: true,
        irreversible_hash: "sha256-short-hash",
        rule: "share only abstract semantic patterns and tunable ranges",
      },
      knowledge_sharing_rules: [
        "share successful remediations as normalized action templates",
        "share anomaly patterns as abstract signatures without raw identity fields",
        "share semantic mappings by ontology-level keys",
        "share gate tuning as parameter ranges and boundary recommendations",
        "deny raw sensitive payload propagation across projects",
      ],
      page_plan: {
        title: "Cross-Project Intelligence Center",
        sections: ["transfer learning schema", "anonymization strategy", "knowledge sharing rules", "transfer result"],
      },
    };
  }

  transfer(input: CrossProjectInput) {
    const remediations = arr(input.successful_remediation).map(anonymizeRecord);
    const anomalyPatterns = arr(input.runtime_anomaly_patterns).map(anonymizeRecord);
    const mappings = arr(input.semantic_mappings).map(anonymizeRecord);
    const tuning = arr(input.gate_tuning_knowledge).map(anonymizeRecord);

    const transferPack = {
      transfer_id: `xproj_transfer_${randomUUID()}`,
      source_project: `src_${hashId(text(input.source_project_id))}`,
      target_project: `tgt_${hashId(text(input.target_project_id))}`,
      shared_knowledge: {
        successful_remediation: remediations,
        runtime_anomaly_patterns: anomalyPatterns,
        semantic_mappings: mappings,
        gate_tuning_knowledge: tuning,
      },
      anonymized: true,
    };

    const recommendations = [
      {
        type: "semantic_transfer_learning",
        message: "Apply transferred remediation templates to similar gate-fail signatures in target project.",
      },
      {
        type: "anomaly_pattern_bootstrap",
        message: "Initialize target anomaly detector with transferred abstract anomaly signatures.",
      },
      {
        type: "gate_tuning_prior",
        message: "Use transferred gate tuning bounds as initial priors, then adapt by local runtime evidence.",
      },
    ];

    const base = remediations.length + anomalyPatterns.length + mappings.length + tuning.length;
    const confidence = Number(Math.min(0.94, 0.5 + base * 0.03).toFixed(3));

    return {
      transfer_pack: transferPack,
      semantic_transfer_recommendations: recommendations,
      confidence,
      anonymization_report: {
        strategy: this.getSchema().anonymization_strategy,
        records_anonymized: base,
      },
    };
  }
}

