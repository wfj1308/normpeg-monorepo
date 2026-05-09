import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { getCrossProjectLearningSchema, runCrossProjectLearningTransfer } from "./platform/api-client.ts";

const DEFAULT_PAYLOAD = {
  source_project_id: "P_SOURCE_001",
  target_project_id: "P_TARGET_009",
  successful_remediation: [
    { issue_signature: "compaction_below_threshold", action_template: "increase roller pass + moisture correction", operator: "user_A" },
  ],
  runtime_anomaly_patterns: [
    { anomaly_type: "repeated_overrides", pattern_signature: "override_burst_on_same_gate", operator_email: "a@example.com" },
  ],
  semantic_mappings: [
    { source_slot: "compaction_degree", target_slot: "subgrade_compaction", mapping_confidence: 0.92 },
  ],
  gate_tuning_knowledge: [
    { gate_id: "gate_compaction_min", recommended_range: { min: 95, max: 98 }, owner_name: "Engineer X" },
  ],
};

function parseObject(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("payload must be JSON object");
  return parsed as Record<string, unknown>;
}

export default function CrossProjectIntelligenceCenter() {
  const [payloadText, setPayloadText] = useState(JSON.stringify(DEFAULT_PAYLOAD, null, 2));
  const [transferSchema, setTransferSchema] = useState<Record<string, unknown> | null>(null);
  const [anonymization, setAnonymization] = useState<Record<string, unknown> | null>(null);
  const [sharingRules, setSharingRules] = useState<string[]>([]);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshSchema() {
    const resp = await getCrossProjectLearningSchema();
    setTransferSchema((resp?.transfer_learning_schema ?? null) as Record<string, unknown> | null);
    setAnonymization((resp?.anonymization_strategy ?? null) as Record<string, unknown> | null);
    setSharingRules(Array.isArray(resp?.knowledge_sharing_rules) ? resp.knowledge_sharing_rules : []);
  }

  useEffect(() => {
    void refreshSchema();
  }, []);

  async function onTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(payloadText);
      const resp = await runCrossProjectLearningTransfer(payload as never);
      setResult(resp as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#f0fdf4,#ecfeff)", color: "#14532d", padding: 20 }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", background: "#ffffffef", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Cross-Project Intelligence Center</h1>
        <p style={{ marginTop: 0 }}>Transfer anonymized semantic knowledge across projects for remediation, anomaly learning, mapping reuse, and gate tuning priors.</p>
        <form onSubmit={onTransfer}>
          <label>
            Cross-Project Transfer Payload
            <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} style={areaStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Transferring..." : "Run Semantic Transfer"}</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void refreshSchema()}>Refresh Schema</button>
          </div>
        </form>
        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>transfer learning schema</summary>
          <pre>{JSON.stringify(transferSchema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>anonymization strategy</summary>
          <pre>{JSON.stringify(anonymization ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>knowledge sharing rules</summary>
          <pre>{JSON.stringify(sharingRules, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>transfer result</summary>
          <pre>{JSON.stringify(result ?? {}, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

const areaStyle: CSSProperties = {
  width: "100%",
  minHeight: 260,
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #86efac",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #bbf7d0", borderRadius: 10, padding: 10, background: "#f0fdf4" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #166534", background: "#166534", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };

