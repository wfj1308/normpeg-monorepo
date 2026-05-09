import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { askEngineeringCopilot, getEngineeringCopilotSchema } from "./platform/api-client.ts";

const DEFAULT_PAYLOAD = {
  question: "为什么这个 Gate 失败？",
  project_context: { project_id: "P1", phase: "critical" },
  runtime_events: [
    { event_id: "evt_1", event_type: "gate_failed", gate_id: "default_gate", rule_id: "single_point_rule", result: "FAIL" },
    { event_id: "evt_2", event_type: "manual_override", gate_id: "default_gate", rule_id: "single_point_rule", result: "OVERRIDE" },
  ],
  proof_records: [{ proof_id: "proof_1", gate_id: "default_gate", rule_id: "single_point_rule", complete: false }],
  specir_records: [{ specir_id: "JTG_F80_1_2017.4.2.1.compaction", gate_id: "default_gate", rule_id: "single_point_rule", clause_text: "压实度不得低于95%" }],
};

function parseObject(text: string): Record<string, unknown> {
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("payload must be JSON object");
  }
  return obj as Record<string, unknown>;
}

export default function EngineeringCopilotConsole() {
  const [payloadText, setPayloadText] = useState(JSON.stringify(DEFAULT_PAYLOAD, null, 2));
  const [flow, setFlow] = useState<Record<string, unknown> | null>(null);
  const [rag, setRag] = useState<Record<string, unknown> | null>(null);
  const [answerSchema, setAnswerSchema] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadSchema() {
    const resp = await getEngineeringCopilotSchema();
    setFlow((resp?.copilot_query_flow ?? null) as Record<string, unknown> | null);
    setRag((resp?.rag_data_sources ?? null) as Record<string, unknown> | null);
    setAnswerSchema((resp?.answer_structure ?? null) as Record<string, unknown> | null);
  }

  useEffect(() => {
    void loadSchema();
  }, []);

  async function onAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(payloadText);
      const resp = await askEngineeringCopilot(payload as never);
      setResult(resp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#f8fafc,#e2e8f0)", color: "#0f172a", padding: 20 }}>
      <div style={{ maxWidth: 1250, margin: "0 auto", background: "rgba(255,255,255,0.96)", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Engineering Copilot Console</h1>
        <p style={{ marginTop: 0 }}>Ask project/spec/gate/proof questions with evidence-grounded answers only.</p>
        <form onSubmit={onAsk}>
          <label>
            Copilot Ask Payload
            <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} style={areaStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Answering..." : "Ask Copilot"}</button>
            <button type="button" disabled={loading} onClick={() => void loadSchema()} style={btnPlain}>Reload Schema</button>
          </div>
        </form>
        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>1) Copilot 查询流程</summary>
          <pre>{JSON.stringify(result?.copilot_query_flow ?? flow ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>2) RAG 数据源</summary>
          <pre>{JSON.stringify(result?.rag_data_sources ?? rag ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>3) 回答结构</summary>
          <pre>{JSON.stringify({ answer_structure: result?.answer_structure ?? answerSchema ?? {}, answer: result?.answer ?? {}, meta: result?.meta ?? {}, policy: result?.policy_enforced ?? {} }, null, 2)}</pre>
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
  border: "1px solid #94a3b8",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #cbd5e1", borderRadius: 10, padding: 10, background: "#f8fafc" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #0f172a", background: "#0f172a", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };

