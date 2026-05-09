import { CSSProperties, FormEvent, useEffect, useState } from "react";
import {
  buildKnowledgeGraph,
  getKnowledgeGraphRuntimeTrace,
  getKnowledgeGraphSchema,
  getSlotUsageKnowledgeGraph,
  runKnowledgeGraphAIRetrieval,
} from "./platform/api-client.ts";

const SAMPLE_SPECS = [
  {
    spec_id: "JTG_F80_1_2017.4.2.1.compaction",
    version: "v1",
    semantics: { standard_id: "JTG_F80_1_2017", clause_refs: ["4.2.1"] },
    inputs: { input_dto: { compaction_degree: { type: "number", unit: "%" } } },
    gate: { rules: [{ rule_id: "r.compaction", field: "compaction_degree", operator: ">=", threshold: 95, unit: "%" }] },
  },
];

function parseSpecs(text: string): Array<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("spec entries must be valid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("spec entries must be a JSON array");
  }
  return parsed.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as Array<Record<string, unknown>>;
}

export default function KnowledgeGraphExplorer() {
  const [specText, setSpecText] = useState(JSON.stringify(SAMPLE_SPECS, null, 2));
  const [slotKey, setSlotKey] = useState("compaction_degree");
  const [semanticQuery, setSemanticQuery] = useState("compaction");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [graphSchema, setGraphSchema] = useState<Record<string, unknown> | null>(null);
  const [graphBuild, setGraphBuild] = useState<Record<string, unknown> | null>(null);
  const [slotImpact, setSlotImpact] = useState<Record<string, unknown> | null>(null);
  const [runtimeTrace, setRuntimeTrace] = useState<Record<string, unknown> | null>(null);
  const [aiRetrieval, setAiRetrieval] = useState<Record<string, unknown> | null>(null);

  async function loadSchema() {
    setLoading(true);
    setError("");
    try {
      const resp = await getKnowledgeGraphSchema();
      setGraphSchema((resp?.graph_schema ?? null) as Record<string, unknown> | null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSchema();
  }, []);

  async function onBuild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const built = await buildKnowledgeGraph({ specs: parseSpecs(specText) });
      setGraphBuild(built as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadSlotImpact() {
    setLoading(true);
    setError("");
    try {
      const impact = await getSlotUsageKnowledgeGraph(slotKey.trim());
      setSlotImpact(impact);
      const trace = await getKnowledgeGraphRuntimeTrace(slotKey.trim(), 6);
      setRuntimeTrace(trace);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function runRetrieval() {
    setLoading(true);
    setError("");
    try {
      const result = await runKnowledgeGraphAIRetrieval({ query: semanticQuery.trim(), limit: 20 });
      setAiRetrieval(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #f0fdf4, #dcfce7)", color: "#14532d", padding: 20 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", background: "rgba(255,255,255,0.95)", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Knowledge Graph Explorer</h1>
        <p style={{ marginTop: 0 }}>AI-Native Norm Knowledge Graph with semantic traversal, impact analysis, runtime tracing and AI retrieval.</p>

        <form onSubmit={onBuild}>
          <label>Spec Entries<textarea value={specText} onChange={(e) => setSpecText(e.target.value)} style={areaStyle} /></label>
          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Building..." : "Build Graph"}</button>
            <button type="button" disabled={loading} onClick={() => void loadSchema()} style={btnPlain}>Reload Graph Schema</button>
          </div>
        </form>

        <div style={{ marginTop: 12, display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
          <label>
            slotKey full-chain impact
            <input value={slotKey} onChange={(e) => setSlotKey(e.target.value)} style={inputStyle} />
            <button type="button" disabled={loading} onClick={() => void loadSlotImpact()} style={{ ...btnPrimary, marginTop: 8 }}>Trace slot impact</button>
          </label>
          <label>
            AI retrieval query
            <input value={semanticQuery} onChange={(e) => setSemanticQuery(e.target.value)} style={inputStyle} />
            <button type="button" disabled={loading} onClick={() => void runRetrieval()} style={{ ...btnPrimary, marginTop: 8 }}>Run AI retrieval</button>
          </label>
        </div>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>graph schema</summary>
          <pre>{JSON.stringify(graphSchema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>traversal engine</summary>
          <pre>{JSON.stringify((graphBuild ?? {}).traversal_engine ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>semantic query engine</summary>
          <pre>{JSON.stringify((graphBuild ?? {}).semantic_query_engine ?? aiRetrieval?.semantic_query_engine ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>slotKey full-chain impact</summary>
          <pre>{JSON.stringify({ slot_usage: slotImpact ?? {}, runtime_trace: runtimeTrace ?? {} }, null, 2)}</pre>
        </details>
        <details style={panelStyle}>
          <summary>graph build payload</summary>
          <pre>{JSON.stringify(graphBuild ?? {}, null, 2)}</pre>
        </details>
        <details style={panelStyle}>
          <summary>AI retrieval payload</summary>
          <pre>{JSON.stringify(aiRetrieval ?? {}, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = { display: "block", width: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 10, border: "1px solid #86efac" };
const areaStyle: CSSProperties = {
  width: "100%",
  minHeight: 200,
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #86efac",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #bbf7d0", borderRadius: 10, padding: 10, background: "#f0fdf4" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #166534", background: "#166534", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#f8fafc", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };

