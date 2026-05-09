import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { buildLiveConclusion, getLiveConclusionSchema } from "./platform/api-client.ts";

export default function LiveComplianceBoard() {
  const [projectId, setProjectId] = useState("P1");
  const [formCode, setFormCode] = useState("");
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [strategy, setStrategy] = useState<Record<string, unknown> | null>(null);
  const [conclusion, setConclusion] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshSchema() {
    setLoading(true);
    setError("");
    try {
      const resp = await getLiveConclusionSchema();
      setSchema((resp?.conclusion_schema ?? null) as Record<string, unknown> | null);
      setStrategy((resp?.aggregation_strategy ?? null) as Record<string, unknown> | null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshSchema();
  }, []);

  async function onBuild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const resp = await buildLiveConclusion({ project_id: projectId.trim() || "unknown_project", form_code: formCode.trim() || undefined });
      setConclusion(resp as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#f0fdf4,#ecfeff)", color: "#0f172a", padding: 20 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", background: "#ffffffee", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Live Compliance Board</h1>
        <p style={{ marginTop: 0 }}>Real-time form-level and project-level conclusion with Gate / Proof / SpecIR traceability.</p>

        <form onSubmit={onBuild}>
          <label>
            Project ID
            <input value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle} />
          </label>
          <label>
            Form Code (optional)
            <input value={formCode} onChange={(e) => setFormCode(e.target.value)} style={inputStyle} />
          </label>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Building..." : "Build Live Conclusion"}</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void refreshSchema()}>Refresh Schema</button>
          </div>
        </form>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>conclusion schema</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>aggregation strategy</summary>
          <pre>{JSON.stringify(strategy ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>页面方案（project-level + form-level + traceability）</summary>
          <pre>{JSON.stringify(conclusion ?? {}, null, 2)}</pre>
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
  border: "1px solid #bbf7d0",
  boxSizing: "border-box",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #bbf7d0", borderRadius: 10, padding: 10, background: "#f0fdf4" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #166534", background: "#166534", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };
