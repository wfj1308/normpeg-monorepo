import { CSSProperties, FormEvent, useEffect, useState } from "react";
import {
  evaluateRuntimeTrust,
  finalizeComplianceWithTrust,
  getRuntimeTrustDashboard,
  getRuntimeTrustSchema,
} from "./platform/api-client.ts";

const DEFAULT_PAYLOAD = {
  project_id: "P1",
  source: { trusted: true, channel: "sensor_gateway" },
  device: { calibration_status: "valid", equipment_type: "compaction_sensor" },
  manual_input: { signed: true, signer: "eng_001" },
  proof: {
    complete: true,
    proof_id: "proof_001",
    signatures: [{ signer: "eng_001", role: "lab" }],
    evidence_chain: {
      standard_code: "JTG-F80/1-2017",
      clause_id: "4.2.1",
    },
  },
  runtime_events: [{ event_type: "rule_executed" }, { event_type: "manual_override", gate_id: "default_gate", operator: "reviewer_1" }],
  recent_values: [92.8, 93.1, 93.0, 97.9],
};

function parseObject(text: string): Record<string, unknown> {
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("payload must be JSON object");
  }
  return obj as Record<string, unknown>;
}

export default function RuntimeTrustDashboard() {
  const [payloadText, setPayloadText] = useState(JSON.stringify(DEFAULT_PAYLOAD, null, 2));
  const [rules, setRules] = useState<Record<string, unknown> | null>(null);
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [dashboard, setDashboard] = useState<Record<string, unknown> | null>(null);
  const [finalizeResult, setFinalizeResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadSchema() {
    const resp = await getRuntimeTrustSchema();
    setRules((resp?.trust_score_rules ?? null) as Record<string, unknown> | null);
    setSchema((resp?.trust_report_schema ?? null) as Record<string, unknown> | null);
  }

  async function loadDashboard() {
    const resp = await getRuntimeTrustDashboard(200);
    setDashboard(resp);
  }

  useEffect(() => {
    void loadSchema();
    void loadDashboard();
  }, []);

  async function onEvaluate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(payloadText);
      const resp = await evaluateRuntimeTrust(payload as never);
      setResult(resp);
      setFinalizeResult(null);
      await loadDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function onFinalize(): Promise<void> {
    const report = (result?.trust_report ?? {}) as Record<string, unknown>;
    const reportId = String(report.report_id ?? "").trim();
    if (!reportId) {
      setError("trust_report.report_id missing, please run Evaluate Trust first");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const resp = await finalizeComplianceWithTrust({
        report_id: reportId,
        requested_by: "trust_dashboard",
      });
      setFinalizeResult(resp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#fff7ed,#ffedd5)", color: "#7c2d12", padding: 20 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", background: "rgba(255,255,255,0.96)", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Trust Dashboard</h1>
        <p style={{ marginTop: 0 }}>Runtime Trust Chain: score trust, classify trust level, and block untrusted auto final compliance.</p>
        <form onSubmit={onEvaluate}>
          <label>
            Trust Evaluate Payload
            <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} style={areaStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Evaluating..." : "Evaluate Trust"}</button>
            <button type="button" disabled={loading} onClick={() => void loadSchema()} style={btnPlain}>Reload Schema</button>
            <button type="button" disabled={loading} onClick={() => void loadDashboard()} style={btnPlain}>Reload Dashboard</button>
            <button type="button" disabled={loading} onClick={() => void onFinalize()} style={btnWarn}>Finalize Compliance (Trust Gate)</button>
          </div>
        </form>
        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>1) trust scoring model</summary>
          <pre>{JSON.stringify(result?.trust_score_rules ?? rules ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>2) trust lifecycle</summary>
          <pre>{JSON.stringify((result?.trust_report as Record<string, unknown> | undefined)?.trust_lifecycle ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>3) trust report schema</summary>
          <pre>{JSON.stringify(result?.trust_report_schema ?? schema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>4) trust report + auto-final gate</summary>
          <pre>{JSON.stringify(result?.trust_report ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>5) low trust proofs</summary>
          <pre>{JSON.stringify(dashboard?.low_trust_proofs ?? [], null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>6) suspicious overrides</summary>
          <pre>{JSON.stringify(dashboard?.suspicious_overrides ?? [], null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>7) missing evidence</summary>
          <pre>{JSON.stringify(dashboard?.missing_evidence ?? [], null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>8) finalize compliance result (untrusted must be blocked)</summary>
          <pre>{JSON.stringify(finalizeResult ?? {}, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

const areaStyle: CSSProperties = {
  width: "100%",
  minHeight: 240,
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #fdba74",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #fed7aa", borderRadius: 10, padding: 10, background: "#fff7ed" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #9a3412", background: "#9a3412", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };
const btnWarn: CSSProperties = { borderRadius: 10, border: "1px solid #92400e", background: "#f59e0b", color: "#111827", padding: "8px 12px", cursor: "pointer" };
