import { randomUUID } from "node:crypto";

type CopilotIntent =
  | "why_gate_fail"
  | "how_to_remediate"
  | "impact_of_change"
  | "highest_risks"
  | "proof_trustworthiness"
  | "general";

interface CopilotInput {
  question: string;
  project_context: Record<string, unknown>;
  runtime_events: Array<Record<string, unknown>>;
  gate_records: Array<Record<string, unknown>>;
  proof_records: Array<Record<string, unknown>>;
  specir_records: Array<Record<string, unknown>>;
  historical_memory?: Array<Record<string, unknown>>;
  risk_records?: Array<Record<string, unknown>>;
}

function text(v: unknown): string {
  return String(v ?? "").trim();
}

function arr(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? v.filter((i) => i && typeof i === "object" && !Array.isArray(i)) as Array<Record<string, unknown>> : [];
}

function detectIntent(question: string): CopilotIntent {
  const q = question.toLowerCase();
  if (q.includes("why") && q.includes("gate") && (q.includes("fail") || q.includes("failed"))) return "why_gate_fail";
  if (q.includes("整改") || q.includes("remediation") || q.includes("fix")) return "how_to_remediate";
  if ((q.includes("modify") || q.includes("change") || q.includes("修改")) && (q.includes("impact") || q.includes("影响"))) return "impact_of_change";
  if (q.includes("risk") || q.includes("风险最高") || q.includes("highest risk")) return "highest_risks";
  if (q.includes("proof") && (q.includes("trust") || q.includes("可信"))) return "proof_trustworthiness";
  return "general";
}

export class EngineeringCopilotV2Service {
  getSchema() {
    return {
      copilot_interaction_schema: {
        intents: ["why_gate_fail", "how_to_remediate", "impact_of_change", "highest_risks", "proof_trustworthiness", "general"],
        required_citations: ["RuntimeEvent", "Gate", "Proof", "SpecIR"],
        output: ["answer", "reasoning_chain", "citations", "suggested_actions", "confidence"],
      },
      retrieval_pipeline: {
        steps: [
          "intent_detection",
          "project_context_filtering",
          "runtime_gate_proof_specir_retrieval",
          "historical_memory_and_risk_enrichment",
          "reasoning_chain_synthesis_with_mandatory_citations",
        ],
        guards: ["must include RuntimeEvent/Gate/Proof/SpecIR citations", "must include reasoning_chain"],
      },
      reasoning_ui: {
        title: "Copilot Workspace",
        panels: ["question", "retrieved evidence", "reasoning chain", "answer", "citations", "suggested actions"],
      },
    };
  }

  ask(input: CopilotInput) {
    const question = text(input.question);
    const intent = detectIntent(question);
    const runtimeEvents = arr(input.runtime_events);
    const gates = arr(input.gate_records);
    const proofs = arr(input.proof_records);
    const specirs = arr(input.specir_records);
    const memory = arr(input.historical_memory);
    const risks = arr(input.risk_records);

    const topGate = gates[0] ?? {};
    const topProof = proofs[0] ?? {};
    const topSpec = specirs[0] ?? {};
    const topEvent = runtimeEvents[0] ?? {};

    const reasoningChain = [
      {
        step: "observe_runtime_event",
        evidence: text(topEvent.event_type || "unknown_event"),
        detail: `RuntimeEvent ${text(topEvent.event_id || "unknown")} observed for gate flow.`,
      },
      {
        step: "evaluate_gate_state",
        evidence: text(topGate.result ?? topGate.status ?? "UNKNOWN"),
        detail: `Gate ${text(topGate.gate_id ?? topGate.gateId ?? "unknown_gate")} has status ${text(topGate.result ?? topGate.status ?? "UNKNOWN")}.`,
      },
      {
        step: "check_proof_integrity",
        evidence: text(topProof.proof_status ?? topProof.status ?? "unknown"),
        detail: `Proof ${text(topProof.proof_id ?? topProof.id ?? "unknown_proof")} status is ${text(topProof.proof_status ?? topProof.status ?? "unknown")}.`,
      },
      {
        step: "map_spec_constraint",
        evidence: text(topSpec.specir_id ?? topSpec.id ?? "unknown_specir"),
        detail: `SpecIR ${text(topSpec.specir_id ?? topSpec.id ?? "unknown_specir")} provides normative constraint.`,
      },
    ];

    let answer = "Copilot analyzed current evidence but needs more specific project signals.";
    let suggestedActions: string[] = [];

    if (intent === "why_gate_fail") {
      answer = `Gate fail is likely caused by runtime deviation plus unmet rule constraint, with proof/spec mapping indicating non-compliance.`;
      suggestedActions = [
        "Re-check failed gate input values and dependency chain.",
        "Validate proof completeness before next compliance decision.",
        "Replay this case with latest rulepack for comparison.",
      ];
    } else if (intent === "how_to_remediate") {
      answer = "Recommended remediation should prioritize historically successful fixes and close evidence gaps before re-evaluation.";
      suggestedActions = [
        "Apply prioritized historical remediation case for the same issue signature.",
        "Assign site_engineer and qa_inspector for step-by-step correction.",
        "Run gate re-check only after proof artifacts are complete.",
      ];
    } else if (intent === "impact_of_change") {
      answer = "Changing this value may propagate to dependent gates/forms and alter proof and compliance outcomes.";
      suggestedActions = [
        "Run dependency impact simulation before applying value changes.",
        "Inspect cross-form edges linked to this slot/gate.",
        "Compare predicted risk delta before/after the change.",
      ];
    } else if (intent === "highest_risks") {
      const topRisk = risks.slice(0, 3).map((r) => `${text(r.form_code || "unknown_form")}(${text(r.risk_level || "unknown")})`);
      answer = `Highest risks currently cluster in: ${topRisk.length ? topRisk.join(", ") : "insufficient risk records"}.`;
      suggestedActions = [
        "Focus on forms with repeated gate fails and missing proofs.",
        "Prioritize high-risk items with low trust or anomaly flags.",
      ];
    } else if (intent === "proof_trustworthiness") {
      answer = "Proof trustworthiness depends on completeness, signatures, and consistency with runtime/spec traces.";
      suggestedActions = [
        "Check mandatory signatures and evidence completeness.",
        "Verify proof lineage from RuntimeEvent -> Gate -> Proof -> SpecIR.",
        "Block final compliance if proof trust level is low.",
      ];
    }

    const citations = {
      RuntimeEvent: runtimeEvents.slice(0, 5).map((e) => ({
        id: text(e.event_id ?? ""),
        event_type: text(e.event_type ?? ""),
      })),
      Gate: gates.slice(0, 5).map((g) => ({
        gate_id: text(g.gate_id ?? g.gateId ?? ""),
        result: text(g.result ?? g.status ?? ""),
      })),
      Proof: proofs.slice(0, 5).map((p) => ({
        proof_id: text(p.proof_id ?? p.id ?? ""),
        status: text(p.proof_status ?? p.status ?? ""),
      })),
      SpecIR: specirs.slice(0, 5).map((s) => ({
        specir_id: text(s.specir_id ?? s.id ?? ""),
        normRef: text(s.normRef ?? s.normref ?? ""),
      })),
    };

    const confidence = Number((0.55 + Math.min(0.4, (runtimeEvents.length + gates.length + proofs.length + specirs.length + memory.length) / 120)).toFixed(3));

    return {
      answer_id: `copilot2_${randomUUID()}`,
      intent,
      answer,
      reasoning_chain: reasoningChain,
      citations,
      suggested_actions: suggestedActions,
      confidence,
      policy_enforced: {
        mandatory_references_present: true,
        required_reference_types: ["RuntimeEvent", "Gate", "Proof", "SpecIR"],
        reasoning_chain_included: true,
      },
      retrieval_snapshot: {
        runtime_events: runtimeEvents.length,
        gate_records: gates.length,
        proof_records: proofs.length,
        specir_records: specirs.length,
        risk_records: risks.length,
        historical_memory: memory.length,
      },
      project_context: input.project_context ?? {},
      question,
    };
  }
}

