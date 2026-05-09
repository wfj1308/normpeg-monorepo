import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { buildLiveConclusion, getLiveConclusionSchema } from "./platform/api-client.ts";

export default function LiveConclusionBoard() {
  const [projectId, setProjectId] = useState("P1");
  const [bridgeId, setBridgeId] = useState("");
  const [formCode, setFormCode] = useState("");
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [aggregationEngine, setAggregationEngine] = useState<Record<string, unknown> | null>(null);
  const [refreshLifecycle, setRefreshLifecycle] = useState<string[]>([]);
  const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshSchema() {
    setLoading(true);
    setError("");
    try {
      const resp = await getLiveConclusionSchema();
      setSchema((resp?.conclusion_schema ?? null) as Record<string, unknown> | null);
      setAggregationEngine((resp?.aggregation_strategy ?? null) as Record<string, unknown> | null);
      setRefreshLifecycle(Array.isArray(resp?.refresh_lifecycle) ? resp.refresh_lifecycle : []);
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
      const resp = await buildLiveConclusion({
        project_id: projectId.trim() || "unknown_project",
        bridge_id: bridgeId.trim() || undefined,
        form_code: formCode.trim() || undefined,
      });
      setSnapshot(resp as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#ecfeff,#f0fdf4)", color: "#0f172a", padding: 20 }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", background: "#ffffffee", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Live Conclusion Board</h1>
        <p style={{ marginTop: 0 }}>Realtime runtime conclusion engine for form/bridge/project levels.</p>

        <form onSubmit={onBuild}>
          <label>
            Project ID
            <input value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle} />
          </label>
          <label>
            Bridge ID (optional)
            <input value={bridgeId} onChange={(e) => setBridgeId(e.target.value)} style={inputStyle} />
          </label>
          <label>
            Form Code (optional)
            <input value={formCode} onChange={(e) => setFormCode(e.target.value)} style={inputStyle} />
          </label>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Building..." : "Build Realtime Conclusion"}</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void refreshSchema()}>Refresh Schema</button>
          </div>
        </form>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>conclusion schema</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>

        <details open style={panelStyle}>
          <summary>aggregation engine</summary>
          <pre>{JSON.stringify(aggregationEngine ?? {}, null, 2)}</pre>
        </details>

        <details open style={panelStyle}>
          <summary>refresh lifecycle</summary>
          <pre>{JSON.stringify(refreshLifecycle, null, 2)}</pre>
        </details>

        <details open style={panelStyle}>
          <summary>live snapshot (form / bridge / project + traceability)</summary>
          <pre>{JSON.stringify(snapshot ?? {}, null, 2)}</pre>
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
  border: "1px solid #99f6e4",
  boxSizing: "border-box",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #99f6e4", borderRadius: 10, padding: 10, background: "#ecfeff" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #0f766e", background: "#0f766e", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };
