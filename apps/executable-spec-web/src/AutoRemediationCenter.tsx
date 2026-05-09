import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { getAutoRemediationSchema, suggestAutoRemediation } from "./platform/api-client.ts";

const DEFAULT_PAYLOAD = {
  failed_gate: { gate_id: "default_gate", rule_id: "single_point_rule", slotKey: "compaction_degree", severity: "critical" },
  input_values: { compaction_degree: 93 },
  threshold: { slotKey: "compaction_degree", operator: ">=", value: 95 },
  specir: {
    specir_id: "JTG_F80_1_2017.4.2.1.compaction",
    normRef: "JTG F80/1-2017 4.2.1",
    clause_text: "压实度不得小于95%",
  },
  historical_fixes: [{ slotKey: "compaction_degree", action: "调整碾压遍数后复测", responsible_role: "site_engineer" }],
  project_context: { project_id: "P1", phase: "critical", section: "K19+070" },
};

function parseObject(text: string): Record<string, unknown> {
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("payload must be JSON object");
  }
  return obj as Record<string, unknown>;
}

export default function AutoRemediationCenter() {
  const [payloadText, setPayloadText] = useState(JSON.stringify(DEFAULT_PAYLOAD, null, 2));
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [flow, setFlow] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadSchema() {
    const resp = await getAutoRemediationSchema();
    setSchema((resp?.remediation_schema ?? null) as Record<string, unknown> | null);
    setFlow((resp?.remediation_closed_loop ?? null) as Record<string, unknown> | null);
  }

  useEffect(() => {
    void loadSchema();
  }, []);

  async function onSuggest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(payloadText);
      const resp = await suggestAutoRemediation(payload as never);
      setResult(resp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#fffbeb,#fef3c7)", color: "#78350f", padding: 20 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", background: "rgba(255,255,255,0.96)", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Auto Remediation Center</h1>
        <p style={{ marginTop: 0 }}>Generate remediation suggestions for failed gates with spec traceability and close-loop guidance.</p>
        <form onSubmit={onSuggest}>
          <label>
            Remediation Input Payload
            <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} style={areaStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Generating..." : "Suggest Remediation"}</button>
            <button type="button" disabled={loading} onClick={() => void loadSchema()} style={btnPlain}>Reload Schema</button>
          </div>
        </form>
        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>1) 整改建议 schema</summary>
          <pre>{JSON.stringify(result?.remediation_schema ?? schema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>2) 整改闭环流程</summary>
          <pre>{JSON.stringify(result?.remediation_closed_loop ?? flow ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>3) 页面交互方案（建议结果 + 规范追溯 + 执行约束）</summary>
          <pre>{JSON.stringify({ suggestion: result?.suggestion ?? {}, traceability: result?.traceability ?? {}, execution_guard: result?.execution_guard ?? {} }, null, 2)}</pre>
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
  border: "1px solid #fcd34d",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #fde68a", borderRadius: 10, padding: 10, background: "#fffbeb" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #a16207", background: "#a16207", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };

