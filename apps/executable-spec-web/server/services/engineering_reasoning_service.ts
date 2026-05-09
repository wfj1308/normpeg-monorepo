import { randomUUID } from "node:crypto";

type RootCauseType =
  | "material_issue"
  | "process_issue"
  | "equipment_issue"
  | "sequencing_issue"
  | "missing_proof"
  | "abnormal_sensor_data";

interface ReasoningInput {
  body_snapshot: Record<string, unknown>;
  gate_result: Record<string, unknown>;
  runtime_events: Array<Record<string, unknown>>;
  specir: Record<string, unknown>;
  historical_runtime_traces: Array<Record<string, unknown>>;
}

function text(v: unknown): string {
  return String(v ?? "").trim();
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function arr(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? v.filter((i) => i && typeof i === "object" && !Array.isArray(i)) as Array<Record<string, unknown>> : [];
}

function detectRootCauses(input: ReasoningInput): Array<{ type: RootCauseType; evidence: string; confidence: number }> {
  const causes: Array<{ type: RootCauseType; evidence: string; confidence: number }> = [];
  const events = input.runtime_events;
  const traces = input.historical_runtime_traces;
  const gate = input.gate_result;

  const materialFlag = events.some((e) => text(e.event_type).toLowerCase().includes("material"))
    || Object.keys(input.body_snapshot).some((k) => k.toLowerCase().includes("moisture") || k.toLowerCase().includes("density"));
  if (materialFlag && text(gate.result || gate.status).toUpperCase() === "FAIL") {
    causes.push({ type: "material_issue", evidence: "material-related signal with failed gate", confidence: 0.78 });
  }

  const processFlag = events.some((e) => text(e.event_type).toLowerCase().includes("process") || text(e.stage).toLowerCase().includes("process"));
  if (processFlag) causes.push({ type: "process_issue", evidence: "runtime process deviation events detected", confidence: 0.66 });

  const equipmentFlag = events.some((e) => text(e.equipment_type).length > 0 && text(e.status).toLowerCase().includes("fault"));
  if (equipmentFlag) causes.push({ type: "equipment_issue", evidence: "equipment fault signal detected", confidence: 0.74 });

  const sequencingFlag = traces.some((t) => text(t.reason).toLowerCase().includes("dependency") || text(t.error).toLowerCase().includes("sequence"));
  if (sequencingFlag) causes.push({ type: "sequencing_issue", evidence: "dependency/sequence conflict in historical trace", confidence: 0.71 });

  const proofMissing = events.some((e) => text(e.proof_ref).length === 0) || text((gate.proof_id ?? gate.proofId ?? "")).length === 0;
  if (proofMissing) causes.push({ type: "missing_proof", evidence: "missing proof reference or unresolved proof id", confidence: 0.84 });

  const sensorAbnormal = events.some((e) => String(e.anomaly ?? "").toLowerCase() === "true" || text(e.event_type).toLowerCase().includes("anomaly"));
  if (sensorAbnormal) causes.push({ type: "abnormal_sensor_data", evidence: "sensor anomaly event detected", confidence: 0.8 });

  if (causes.length === 0) {
    causes.push({ type: "process_issue", evidence: "no dominant anomaly detected, defaulting to process variance", confidence: 0.42 });
  }

  return causes;
}

function buildSuggestedActions(causes: Array<{ type: RootCauseType; evidence: string; confidence: number }>): string[] {
  const actions = new Set<string>();
  for (const c of causes) {
    if (c.type === "material_issue") actions.add("Recheck material batch certificate and moisture/density onsite test");
    if (c.type === "process_issue") actions.add("Review execution SOP and operator checklist for this stage");
    if (c.type === "equipment_issue") actions.add("Calibrate or replace faulty equipment and rerun gate");
    if (c.type === "sequencing_issue") actions.add("Reorder workflow based on dependency graph and rerun blocked step");
    if (c.type === "missing_proof") actions.add("Generate/attach required proof artifacts before compliance finalization");
    if (c.type === "abnormal_sensor_data") actions.add("Validate sensor stream, remove outliers, and replay runtime evaluation");
  }
  return Array.from(actions);
}

export function getEngineeringReasoningSchema() {
  return {
    reasoning_schema: {
      input: ["body_snapshot", "gate_result", "runtime_events", "specir", "historical_runtime_traces"],
      output: ["reasoning_chain", "root_causes", "impacted_entities", "confidence", "suggested_actions"],
      traceability_required: ["Gate", "Proof", "SpecIR", "RuntimeEvent"],
    },
    causal_chain_structure: {
      node_fields: ["actual_value", "expected_value", "violated_constraint", "dependency_chain"],
      root_cause_types: [
        "material_issue",
        "process_issue",
        "equipment_issue",
        "sequencing_issue",
        "missing_proof",
        "abnormal_sensor_data",
      ],
    },
    panel_plan: {
      title: "Engineering Reasoning Panel",
      sections: ["reasoning chain", "root causes", "impacted entities", "confidence", "suggested actions", "traceability map"],
    },
  };
}

export function runEngineeringReasoning(input: ReasoningInput) {
  const body = input.body_snapshot ?? {};
  const gate = input.gate_result ?? {};
  const events = arr(input.runtime_events);
  const traces = arr(input.historical_runtime_traces);
  const specir = input.specir ?? {};

  const slotKey = text(gate.slotKey ?? gate.slot_key ?? Object.keys(body)[0] ?? "unknown_slot");
  const actualValue = num((body as Record<string, unknown>)[slotKey]) ?? num(gate.actual) ?? null;
  const expectedValue = num(gate.expected) ?? num(gate.threshold) ?? null;
  const violatedConstraint = text(gate.violated_constraint ?? gate.rule_id ?? gate.ruleId ?? "constraint_unknown");
  const dependencyChain = traces
    .slice(0, 5)
    .map((t) => text(t.step || t.node_id || t.event_id || t.reason || "unknown"))
    .filter(Boolean);

  const reasoningChain = {
    chain_id: `eng_reason_${randomUUID()}`,
    actual_value: actualValue,
    expected_value: expectedValue,
    violated_constraint: violatedConstraint,
    dependency_chain: dependencyChain,
    gate_trace: {
      gate_id: text(gate.gate_id ?? gate.gateId ?? "default_gate"),
      result: text(gate.result ?? gate.status ?? "UNKNOWN"),
      rule_id: text(gate.rule_id ?? gate.ruleId ?? "unknown_rule"),
    },
    proof_trace: {
      proof_id: text(gate.proof_id ?? gate.proofId ?? gate.proof_ref ?? ""),
      proof_status: text(gate.proof_status ?? "unknown"),
    },
    specir_trace: {
      specir_id: text((specir as Record<string, unknown>).specir_id ?? (specir as Record<string, unknown>).id ?? "unknown_specir"),
      normref: text((specir as Record<string, unknown>).normRef ?? (specir as Record<string, unknown>).normdoc_id ?? "unknown_normref"),
    },
    runtime_event_trace: events.slice(0, 8).map((e) => ({
      event_id: text(e.event_id ?? ""),
      event_type: text(e.event_type ?? ""),
      timestamp: text(e.timestamp ?? e.created_at ?? ""),
    })),
  };

  const rootCauses = detectRootCauses({
    body_snapshot: body,
    gate_result: gate,
    runtime_events: events,
    specir: specir as Record<string, unknown>,
    historical_runtime_traces: traces,
  });

  const impactedEntities = {
    slots: [slotKey],
    gates: [text(gate.gate_id ?? gate.gateId ?? "default_gate")],
    proofs: [text(gate.proof_id ?? gate.proofId ?? gate.proof_ref ?? "")].filter(Boolean),
    specir: [text((specir as Record<string, unknown>).specir_id ?? (specir as Record<string, unknown>).id ?? "")].filter(Boolean),
    runtime_events: events.slice(0, 20).map((e) => text(e.event_id ?? "")).filter(Boolean),
  };

  const confidence = Number((rootCauses.reduce((s, c) => s + c.confidence, 0) / rootCauses.length).toFixed(3));
  const suggestedActions = buildSuggestedActions(rootCauses);

  return {
    reasoning_chain: reasoningChain,
    root_causes: rootCauses,
    impacted_entities: impactedEntities,
    confidence,
    suggested_actions: suggestedActions,
    traceability: {
      Gate: reasoningChain.gate_trace,
      Proof: reasoningChain.proof_trace,
      SpecIR: reasoningChain.specir_trace,
      RuntimeEvent: reasoningChain.runtime_event_trace,
    },
  };
}
