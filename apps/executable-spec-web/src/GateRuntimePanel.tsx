import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { evaluateGateRuntime, getGateRuntimeSchema, listGateRuntimeEvents } from "./platform/api-client.ts";

const DEFAULT_PAYLOAD = {
  gate_id: "gate_compaction_threshold",
  gate_type: "threshold",
  slot_refs: ["compaction_degree"],
  operator: ">=",
  threshold: 95,
  min: null,
  max: null,
  formula_ref: "",
  condition: "",
  on_pass: "PASS",
  on_fail: "FAIL",
  severity: "reject",
  runtime_mode: "automatic",
  confidence: 0.92,
  current_input: { compaction_degree: 93.7 },
  specir: "specir.compaction.4.2.1",
  rule: "rule.compaction.minimum",
  normRef: "JTG_F80_1_2017#4.2.1",
  source_clause: "压实度不得低于95%",
};

function parseObject(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("payload must be JSON object");
  }
  return parsed as Record<string, unknown>;
}

export default function GateRuntimePanel() {
  const [payloadText, setPayloadText] = useState(JSON.stringify(DEFAULT_PAYLOAD, null, 2));
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [flow, setFlow] = useState<string[]>([]);
  const [latest, setLatest] = useState<Record<string, unknown> | null>(null);
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function refreshAll() {
    setLoading(true);
    setError("");
    try {
      const [schemaResp, eventsResp] = await Promise.all([getGateRuntimeSchema(), listGateRuntimeEvents(50)]);
      setSchema((schemaResp?.gate_schema ?? null) as Record<string, unknown> | null);
      setFlow(Array.isArray(schemaResp?.runtime_execution_flow) ? schemaResp.runtime_execution_flow : []);
      setEvents(Array.isArray(eventsResp?.items) ? eventsResp.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  async function onEvaluate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(payloadText);
      const result = await evaluateGateRuntime(payload as never);
      setLatest((result?.event ?? null) as Record<string, unknown> | null);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const latestInput = latest && typeof latest.current_input === "object" ? latest.current_input : {};

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#f8fafc,#e2e8f0)", color: "#0f172a", padding: 20 }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", background: "rgba(255,255,255,0.95)", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Gate Runtime Panel</h1>
        <p style={{ marginTop: 0 }}>统一 Gate 执行面板，所有判定均可追溯到 SpecIR / Rule / normRef。</p>

        <form onSubmit={onEvaluate}>
          <label>
            Gate Payload
            <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} style={areaStyle} />
          </label>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Evaluating..." : "Evaluate Gate"}</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void refreshAll()}>Refresh</button>
          </div>
        </form>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>当前输入 / 判定结果 / fail reason / source clause</summary>
          <pre>{JSON.stringify({
            current_input: latestInput,
            judgement_result: latest?.judgement_result ?? null,
            fail_reason: latest?.fail_reason ?? null,
            source_clause: latest?.source_clause ?? null,
            traceability: latest?.traceability ?? null,
          }, null, 2)}</pre>
        </details>

        <details open style={panelStyle}>
          <summary>gate schema</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>

        <details open style={panelStyle}>
          <summary>runtime execution flow</summary>
          <pre>{JSON.stringify(flow, null, 2)}</pre>
        </details>

        <details style={panelStyle}>
          <summary>events</summary>
          <pre>{JSON.stringify(events, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

const areaStyle: CSSProperties = {
  width: "100%",
  minHeight: 220,
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
