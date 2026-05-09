import { CSSProperties, FormEvent, useEffect, useState } from "react";
import {
  getSemanticConsistencySchema,
  listSemanticConsistencyEvents,
  runSemanticConsistency,
} from "./platform/api-client.ts";

export default function ConsistencyReport() {
  const [projectId, setProjectId] = useState("P1");
  const [formCode, setFormCode] = useState("");
  const [rules, setRules] = useState<Record<string, unknown> | null>(null);
  const [engine, setEngine] = useState<Record<string, unknown> | null>(null);
  const [workflow, setWorkflow] = useState<Record<string, unknown> | null>(null);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshSchema() {
    setLoading(true);
    setError("");
    try {
      const resp = await getSemanticConsistencySchema();
      setRules((resp?.consistency_rules ?? null) as Record<string, unknown> | null);
      setEngine((resp?.detection_engine ?? null) as Record<string, unknown> | null);
      setWorkflow((resp?.remediation_workflow ?? null) as Record<string, unknown> | null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function refreshEvents() {
    try {
      const resp = await listSemanticConsistencyEvents({
        project_id: projectId.trim() || undefined,
        limit: 200,
      });
      setEvents(Array.isArray(resp?.items) ? resp.items : []);
    } catch {
      setEvents([]);
    }
  }

  useEffect(() => {
    void refreshSchema();
    void refreshEvents();
  }, []);

  async function onRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const resp = await runSemanticConsistency({ project_id: projectId.trim() || "unknown_project", form_code: formCode.trim() || undefined });
      setReport(resp as Record<string, unknown>);
      await refreshEvents();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#ecfeff,#f0f9ff)", color: "#0f172a", padding: 20 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", background: "#ffffffee", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Semantic Consistency Report</h1>
        <p style={{ marginTop: 0 }}>Ensure semantic consistency across Body, Gate, Proof and Conclusion before publish.</p>

        <form onSubmit={onRun}>
          <label>
            Project ID
            <input value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle} />
          </label>
          <label>
            Form Code (optional)
            <input value={formCode} onChange={(e) => setFormCode(e.target.value)} style={inputStyle} />
          </label>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Running..." : "Run Semantic Consistency"}</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void refreshSchema()}>Refresh Schema</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void refreshEvents()}>Refresh Events</button>
          </div>
        </form>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>consistency rules</summary>
          <pre>{JSON.stringify(rules ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>detection engine</summary>
          <pre>{JSON.stringify(engine ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>remediation workflow</summary>
          <pre>{JSON.stringify(workflow ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>semantic consistency report (issues / block publish / request review)</summary>
          <pre>{JSON.stringify(report ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>inconsistency events</summary>
          <pre>{JSON.stringify(events, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  marginTop: 6,
  marginBottom: 8,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #a5f3fc",
  boxSizing: "border-box",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #bae6fd", borderRadius: 10, padding: 10, background: "#f0f9ff" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #0c4a6e", background: "#0c4a6e", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };
