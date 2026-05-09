import { CSSProperties, FormEvent, useEffect, useState } from "react";
import {
  analyzeEngineeringRootCause,
  buildEngineeringCausalGraph,
  getEngineeringCausalGraphSchema,
  predictEngineeringDownstreamImpact,
  traverseEngineeringCausalGraph,
} from "./platform/api-client.ts";

const DEFAULT_GRAPH = {
  body: [
    { id: "Body:compaction_degree_low", label: "压实度低" },
    { id: "Body:moisture_content_high", label: "含水率高" }
  ],
  weather: [
    { id: "Weather:rainy", label: "雨天" }
  ],
  processes: [
    { id: "Process:insufficient_rolling_times", label: "碾压次数不足" }
  ],
  gates: [
    { id: "Gate:default_gate", label: "default_gate" }
  ],
  proofs: [
    { id: "Proof:proof_001", label: "proof_001" }
  ],
  conclusions: [
    { id: "Conclusion:review_required", label: "结论待复核" }
  ],
  edges: [
    { from: "Weather:rainy", to: "Body:moisture_content_high", relation: "causes", weight: 0.9 },
    { from: "Body:moisture_content_high", to: "Body:compaction_degree_low", relation: "causes", weight: 0.85 },
    { from: "Process:insufficient_rolling_times", to: "Body:compaction_degree_low", relation: "contributes_to", weight: 0.78 },
    { from: "Body:compaction_degree_low", to: "Gate:default_gate", relation: "causes", weight: 0.92 },
    { from: "Gate:default_gate", to: "Proof:proof_001", relation: "causes", weight: 0.9 },
    { from: "Proof:proof_001", to: "Conclusion:review_required", relation: "causes", weight: 0.88 }
  ]
};

export default function CausalExplorer() {
  const [graphText, setGraphText] = useState(JSON.stringify(DEFAULT_GRAPH, null, 2));
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [algo, setAlgo] = useState<Record<string, unknown> | null>(null);
  const [plan, setPlan] = useState<Record<string, unknown> | null>(null);
  const [example, setExample] = useState<Record<string, unknown> | null>(null);
  const [buildResult, setBuildResult] = useState<Record<string, unknown> | null>(null);
  const [traverseResult, setTraverseResult] = useState<Record<string, unknown> | null>(null);
  const [rootCauseResult, setRootCauseResult] = useState<Record<string, unknown> | null>(null);
  const [impactResult, setImpactResult] = useState<Record<string, unknown> | null>(null);
  const [startNodeId, setStartNodeId] = useState("Body:compaction_degree_low");
  const [targetNodeId, setTargetNodeId] = useState("Body:compaction_degree_low");
  const [sourceNodeId, setSourceNodeId] = useState("Weather:rainy");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshSchema() {
    setLoading(true);
    setError("");
    try {
      const resp = await getEngineeringCausalGraphSchema();
      setSchema((resp?.causal_graph_schema ?? null) as Record<string, unknown> | null);
      setAlgo((resp?.root_cause_algorithm ?? null) as Record<string, unknown> | null);
      setPlan((resp?.page_plan ?? null) as Record<string, unknown> | null);
      setExample((resp?.example ?? null) as Record<string, unknown> | null);
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
      const payload = JSON.parse(graphText) as Record<string, unknown>;
      const resp = await buildEngineeringCausalGraph(payload as never);
      setBuildResult(resp as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function runTraverse() {
    setLoading(true);
    setError("");
    try {
      const resp = await traverseEngineeringCausalGraph({ start_node_id: startNodeId.trim(), direction: "upstream", max_depth: 5 });
      setTraverseResult(resp as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function runRootCause() {
    setLoading(true);
    setError("");
    try {
      const resp = await analyzeEngineeringRootCause({ target_node_id: targetNodeId.trim(), max_depth: 5 });
      setRootCauseResult(resp as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function runImpact() {
    setLoading(true);
    setError("");
    try {
      const resp = await predictEngineeringDownstreamImpact({ source_node_id: sourceNodeId.trim(), max_depth: 5 });
      setImpactResult(resp as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#f0fdfa,#ecfeff)", color: "#0f172a", padding: 20 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", background: "#ffffffee", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Causal Explorer</h1>
        <p style={{ marginTop: 0 }}>Upgrade from association to causality with traversal, root cause analysis, and downstream impact prediction.</p>

        <form onSubmit={onBuild}>
          <label>
            Causal Graph Build Payload
            <textarea value={graphText} onChange={(e) => setGraphText(e.target.value)} style={areaStyle} />
          </label>
          <label>
            Traverse Start Node
            <input value={startNodeId} onChange={(e) => setStartNodeId(e.target.value)} style={inputStyle} />
          </label>
          <label>
            Root Cause Target Node
            <input value={targetNodeId} onChange={(e) => setTargetNodeId(e.target.value)} style={inputStyle} />
          </label>
          <label>
            Impact Source Node
            <input value={sourceNodeId} onChange={(e) => setSourceNodeId(e.target.value)} style={inputStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Building..." : "Build Causal Graph"}</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void runTraverse()}>Run Causal Traversal</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void runRootCause()}>Run Root Cause Analysis</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void runImpact()}>Predict Downstream Impact</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void refreshSchema()}>Refresh Schema</button>
          </div>
        </form>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>causal graph schema</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>root cause algorithm</summary>
          <pre>{JSON.stringify(algo ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>page plan</summary>
          <pre>{JSON.stringify(plan ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>example: 压实度低 ← 雨天 ← 含水率高 ← 碾压次数不足</summary>
          <pre>{JSON.stringify(example ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>build result</summary>
          <pre>{JSON.stringify(buildResult ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>causal traversal result</summary>
          <pre>{JSON.stringify(traverseResult ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>root cause analysis result</summary>
          <pre>{JSON.stringify(rootCauseResult ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>downstream impact prediction result</summary>
          <pre>{JSON.stringify(impactResult ?? {}, null, 2)}</pre>
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
  border: "1px solid #99f6e4",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const inputStyle: CSSProperties = {
  width: "100%",
  marginTop: 6,
  marginBottom: 8,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #99f6e4",
  boxSizing: "border-box",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #99f6e4", borderRadius: 10, padding: 10, background: "#f0fdfa" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #115e59", background: "#115e59", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };
