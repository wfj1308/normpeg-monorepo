import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { askNormQA, getNormQASchema, type NormQAResponse } from "./platform/api-client.ts";

export default function NormQAConsole() {
  const [question, setQuestion] = useState("桩顶高程偏差要求是什么？");
  const [topK, setTopK] = useState("20");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [retrievalStrategy, setRetrievalStrategy] = useState<Record<string, unknown> | null>(null);
  const [citationDesign, setCitationDesign] = useState<Record<string, unknown> | null>(null);
  const [answer, setAnswer] = useState<NormQAResponse | null>(null);

  async function loadSchema() {
    setLoading(true);
    setError("");
    try {
      const resp = await getNormQASchema();
      setSchema((resp?.qa_schema ?? null) as Record<string, unknown> | null);
      setRetrievalStrategy((resp?.retrieval_strategy ?? null) as Record<string, unknown> | null);
      setCitationDesign((resp?.citation_design ?? null) as Record<string, unknown> | null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSchema();
  }, []);

  async function onAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const resp = await askNormQA({ question: question.trim(), top_k: Number(topK) || 20 });
      setAnswer(resp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAnswer(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #f5f3ff, #ede9fe)", color: "#312e81", padding: 20 }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", background: "rgba(255,255,255,0.95)", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Norm QA Console</h1>
        <p style={{ marginTop: 0 }}>Ask norm knowledge directly with semantic retrieval and evidence citations.</p>

        <form onSubmit={onAsk}>
          <label>
            Question
            <textarea value={question} onChange={(e) => setQuestion(e.target.value)} style={areaStyle} />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            top_k
            <input value={topK} onChange={(e) => setTopK(e.target.value)} style={inputStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Answering..." : "Ask Norm QA"}</button>
            <button type="button" disabled={loading} onClick={() => void loadSchema()} style={btnPlain}>Reload QA Schema</button>
          </div>
        </form>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>QA schema</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>retrieval strategy</summary>
          <pre>{JSON.stringify(retrievalStrategy ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>citation design</summary>
          <pre>{JSON.stringify(citationDesign ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>answer + evidence</summary>
          <pre>{JSON.stringify(answer ?? {}, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = { display: "block", width: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 10, border: "1px solid #c4b5fd" };
const areaStyle: CSSProperties = {
  width: "100%",
  minHeight: 120,
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #c4b5fd",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #ddd6fe", borderRadius: 10, padding: 10, background: "#f5f3ff" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #4c1d95", background: "#4c1d95", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#f8fafc", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };

