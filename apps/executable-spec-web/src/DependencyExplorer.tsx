import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { getRuntimeDependencyGraphSchema, recomputeRuntimeDependencyGraph } from "./platform/api-client.ts";

const DEFAULT_RECOMPUTE = {
  body_id: "",
  slotKey: "compaction_degree",
  form_code: "T0921-2019",
  project_id: "P1",
};

function parseObject(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("payload must be JSON object");
  }
  return parsed as Record<string, unknown>;
}

export default function DependencyExplorer() {
  const [recomputeText, setRecomputeText] = useState(JSON.stringify(DEFAULT_RECOMPUTE, null, 2));
  const [graphSchema, setGraphSchema] = useState<Record<string, unknown> | null>(null);
  const [graph, setGraph] = useState<Record<string, unknown> | null>(null);
  const [cycleDetection, setCycleDetection] = useState<Record<string, unknown> | null>(null);
  const [strategy, setStrategy] = useState<Record<string, unknown> | null>(null);
  const [recomputeResult, setRecomputeResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshAll() {
    setLoading(true);
    setError("");
    try {
      const resp = await getRuntimeDependencyGraphSchema();
      setGraphSchema((resp?.graph_schema ?? null) as Record<string, unknown> | null);
      setGraph((resp?.graph ?? null) as Record<string, unknown> | null);
      setCycleDetection((resp?.cycle_detection ?? null) as Record<string, unknown> | null);
      setStrategy((resp?.recompute_strategy ?? null) as Record<string, unknown> | null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  async function onRecompute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(recomputeText);
      const resp = await recomputeRuntimeDependencyGraph(payload as never);
      setRecomputeResult((resp?.recompute_result ?? null) as Record<string, unknown> | null);
      if (resp?.cycle_detection && typeof resp.cycle_detection === "object") {
        setCycleDetection(resp.cycle_detection as Record<string, unknown>);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#eef2ff,#f8fafc)", color: "#0f172a", padding: 20 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", background: "#ffffffee", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Dependency Impact Viewer</h1>
        <p style={{ marginTop: 0 }}>Dependency Impact Viewer: Body to Gate to Proof to Conclusion, with invalidation, lazy/incremental recompute and cycle prevention.</p>

        <form onSubmit={onRecompute}>
          <label>
            Recompute Payload
            <textarea value={recomputeText} onChange={(e) => setRecomputeText(e.target.value)} style={areaStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Recomputing..." : "Run Incremental Recompute"}</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void refreshAll()}>Refresh Graph</button>
          </div>
        </form>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>graph schema</summary>
          <pre>{JSON.stringify(graphSchema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>recompute strategy</summary>
          <pre>{JSON.stringify(strategy ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>cycle detection</summary>
          <pre>{JSON.stringify(cycleDetection ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>incremental recompute result (affected gates / proofs / conclusions)</summary>
          <pre>{JSON.stringify(recomputeResult ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>页面方案（graph explorer）</summary>
          <pre>{JSON.stringify(graph ?? {}, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

const areaStyle: CSSProperties = {
  width: "100%",
  minHeight: 180,
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #cbd5e1", borderRadius: 10, padding: 10, background: "#f8fafc" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #0f172a", background: "#0f172a", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };
