import { CSSProperties, FormEvent, useMemo, useState } from "react";

type LayoutRequest = {
  document_type: "pdf" | "word" | "scanned_image" | "screenshot";
  content_text: string;
};

type AnalyzeResponse = {
  layout_schema?: Record<string, unknown>;
  ocr_fusion_strategy?: Record<string, unknown>;
  semantic_layout_engine?: Record<string, unknown>;
  layout_semantic_ir?: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

const SAMPLE_TEXT = [
  "1 General",
  "1.1 Quality Requirements",
  "Tolerance: compaction degree +/-1%",
  "Merged cell: stake range (colspan)",
  "compactionDegree = (dryDensity / maxDryDensity) * 100",
  "Note: add recheck under rainy condition",
].join("\n");

export default function LayoutSemanticViewer() {
  const [apiBase, setApiBase] = useState("/api");
  const [payload, setPayload] = useState<LayoutRequest>({ document_type: "pdf", content_text: SAMPLE_TEXT });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  const endpoint = useMemo(() => {
    const base = apiBase.trim().replace(/\/$/, "");
    return `${base}/v1/layout-semantic/analyze`;
  }, [apiBase]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await resp.json()) as AnalyzeResponse;
      if (!resp.ok) {
        setError(JSON.stringify(body));
        setResult(null);
      } else {
        setResult(body);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)", color: "#0f172a", padding: 24 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", background: "rgba(255,255,255,0.92)", borderRadius: 16, padding: 20, boxShadow: "0 12px 40px rgba(15,23,42,0.12)" }}>
        <h1 style={{ marginTop: 0 }}>Layout Semantic Viewer</h1>
        <p style={{ marginTop: 0 }}>Shows layout schema, OCR fusion strategy, semantic layout engine and layout_semantic_ir.</p>

        <form onSubmit={onSubmit}>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            <label>
              API Base
              <input value={apiBase} onChange={(e) => setApiBase(e.target.value)} style={inputStyle} placeholder="/api" />
            </label>
            <label>
              Document Type
              <select
                value={payload.document_type}
                onChange={(e) => setPayload((old) => ({ ...old, document_type: e.target.value as LayoutRequest["document_type"] }))}
                style={inputStyle}
              >
                <option value="pdf">PDF</option>
                <option value="word">Word</option>
                <option value="scanned_image">Scanned image</option>
                <option value="screenshot">Screenshot</option>
              </select>
            </label>
          </div>

          <label style={{ display: "block", marginTop: 12 }}>
            Content Text
            <textarea
              value={payload.content_text}
              onChange={(e) => setPayload((old) => ({ ...old, content_text: e.target.value }))}
              style={{ ...inputStyle, minHeight: 180, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
            />
          </label>

          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? "Analyzing..." : "Analyze Layout"}
          </button>
        </form>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        {result ? (
          <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
            <Panel title="layout schema" data={result.layout_schema} />
            <Panel title="OCR fusion strategy" data={result.ocr_fusion_strategy} />
            <Panel title="semantic layout engine" data={result.semantic_layout_engine} />
            <Panel title="layout_semantic_ir" data={result.layout_semantic_ir} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Panel({ title, data }: { title: string; data: unknown }) {
  return (
    <section style={{ border: "1px solid #cbd5e1", borderRadius: 12, padding: 12, background: "#f8fafc" }}>
      <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>{title}</h2>
      <pre style={{ margin: 0, overflowX: "auto" }}>{JSON.stringify(data ?? {}, null, 2)}</pre>
    </section>
  );
}

const inputStyle: CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 4,
  padding: "10px 12px",
  border: "1px solid #94a3b8",
  borderRadius: 10,
  boxSizing: "border-box",
};

const buttonStyle: CSSProperties = {
  marginTop: 12,
  padding: "10px 16px",
  borderRadius: 10,
  border: "1px solid #0f172a",
  background: "#0f172a",
  color: "#f8fafc",
  cursor: "pointer",
};

const errorStyle: CSSProperties = {
  marginTop: 12,
  border: "1px solid #ef4444",
  borderRadius: 10,
  background: "#fef2f2",
  color: "#7f1d1d",
  padding: 10,
};
