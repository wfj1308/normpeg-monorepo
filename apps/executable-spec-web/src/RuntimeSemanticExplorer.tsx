import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { getRuntimeSemanticGraphSchema, replayRuntimeSemanticGraph, traverseRuntimeSemanticGraph } from "./platform/api-client.ts";

export default function RuntimeSemanticExplorer() {
  const [startNodeId, setStartNodeId] = useState("body_001");
  const [maxDepth, setMaxDepth] = useState(4);
  const [edgeTypes, setEdgeTypes] = useState("triggers,proves,aggregates_to,depends_on");
  const [replayExecutionId, setReplayExecutionId] = useState("");
  const [graphSchema, setGraphSchema] = useState<Record<string, unknown> | null>(null);
  const [dependencyEngine, setDependencyEngine] = useState<Record<string, unknown> | null>(null);
  const [traversalLogic, setTraversalLogic] = useState<Record<string, unknown> | null>(null);
  const [graph, setGraph] = useState<Record<string, unknown> | null>(null);
  const [cycleDetection, setCycleDetection] = useState<Record<string, unknown> | null>(null);
  const [traversal, setTraversal] = useState<Record<string, unknown> | null>(null);
  const [lastReplay, setLastReplay] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshAll() {
    setLoading(true);
    setError("");
    try {
      const resp = await getRuntimeSemanticGraphSchema();
      setGraphSchema((resp?.graph_schema ?? null) as Record<string, unknown> | null);
      setDependencyEngine((resp?.dependency_engine ?? null) as Record<string, unknown> | null);
      setTraversalLogic((resp?.runtime_traversal_logic ?? null) as Record<string, unknown> | null);
      setGraph((resp?.graph ?? null) as Record<string, unknown> | null);
      setCycleDetection((resp?.cycle_detection ?? null) as Record<string, unknown> | null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  async function onTraverse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const edges = edgeTypes
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      const resp = await traverseRuntimeSemanticGraph({
        start_node_id: startNodeId.trim(),
        max_depth: maxDepth,
        edge_types: edges,
      });
      setTraversal((resp?.traversal ?? null) as Record<string, unknown> | null);
      if (resp?.cycle_detection && typeof resp.cycle_detection === "object") {
        setCycleDetection(resp.cycle_detection as Record<string, unknown>);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onReplay() {
    if (!replayExecutionId.trim()) return;
    setLoading(true);
    setError("");
    try {
      const resp = await replayRuntimeSemanticGraph(replayExecutionId.trim());
      setLastReplay(resp as Record<string, unknown>);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#eef2ff,#ecfeff)", color: "#0f172a", padding: 20 }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", background: "#ffffffee", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Runtime Semantic Explorer</h1>
        <p style={{ marginTop: 0 }}>Real-time semantic graph for Body/Gate/Proof/Conclusion with incremental update, traversal, cycle detection and replay.</p>

        <form onSubmit={onTraverse}>
          <label>
            Start Node ID
            <input value={startNodeId} onChange={(e) => setStartNodeId(e.target.value)} style={inputStyle} />
          </label>
          <label>
            Max Depth
            <input type="number" value={maxDepth} onChange={(e) => setMaxDepth(Number(e.target.value) || 1)} style={inputStyle} />
          </label>
          <label>
            Edge Types (comma separated)
            <input value={edgeTypes} onChange={(e) => setEdgeTypes(e.target.value)} style={inputStyle} />
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Traversing..." : "Run Traversal"}</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void refreshAll()}>Refresh Graph</button>
          </div>
        </form>

        <div style={{ marginTop: 10 }}>
          <label>
            Replay Execution ID
            <input value={replayExecutionId} onChange={(e) => setReplayExecutionId(e.target.value)} style={inputStyle} />
          </label>
          <button type="button" disabled={loading} style={btnPlain} onClick={() => void onReplay()}>Replay Into Graph</button>
        </div>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>graph schema</summary>
          <pre>{JSON.stringify(graphSchema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>dependency engine</summary>
          <pre>{JSON.stringify(dependencyEngine ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>runtime traversal logic</summary>
          <pre>{JSON.stringify(traversalLogic ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>cycle detection</summary>
          <pre>{JSON.stringify(cycleDetection ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>traversal result</summary>
          <pre>{JSON.stringify(traversal ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>replay result</summary>
          <pre>{JSON.stringify(lastReplay ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>页面结构（full graph）</summary>
          <pre>{JSON.stringify(graph ?? {}, null, 2)}</pre>
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
  border: "1px solid #c7d2fe",
  boxSizing: "border-box",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #c7d2fe", borderRadius: 10, padding: 10, background: "#eef2ff" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #3730a3", background: "#3730a3", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };
