import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { getUnifiedInputParserSchema, parseUnifiedInput } from "./platform/api-client.ts";

const DEFAULT_PAYLOAD = {
  input_type: "自然语言施工描述",
  content_text: "路基压实度应不低于95%，雨天不得施工。",
  ocr_blocks: [
    { block_id: "ocr_001", text: "压实度应不低于95%", bbox: [32, 180, 640, 236], page: 1, confidence: 0.94 },
  ],
  metadata: { project_id: "P1", source_ref: "mobile_note_001" },
};

function parseObject(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("payload must be JSON object");
  }
  return parsed as Record<string, unknown>;
}

export default function InputPipelineViewer() {
  const [payloadText, setPayloadText] = useState(JSON.stringify(DEFAULT_PAYLOAD, null, 2));
  const [pipeline, setPipeline] = useState<Record<string, unknown> | null>(null);
  const [strategy, setStrategy] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshSchema() {
    setLoading(true);
    setError("");
    try {
      const resp = await getUnifiedInputParserSchema();
      setPipeline((resp?.parser_pipeline ?? null) as Record<string, unknown> | null);
      setStrategy((resp?.semantic_normalization_strategy ?? null) as Record<string, unknown> | null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshSchema();
  }, []);

  async function onParse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(payloadText);
      const parsed = await parseUnifiedInput(payload as never);
      setResult(parsed as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#ecfeff,#f0f9ff)", color: "#0f172a", padding: 20 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", background: "#ffffffee", borderRadius: 16, padding: 20, border: "1px solid #cfe7ef" }}>
        <h1 style={{ marginTop: 0 }}>Input Pipeline Viewer</h1>
        <p style={{ marginTop: 0 }}>Unified input parser from PDF/Word/Image/Excel/Mobile/NL to Document IR -> Semantic IR -> SpecIR.</p>

        <form onSubmit={onParse}>
          <label>
            Parser Payload
            <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} style={areaStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Parsing..." : "Run Parse"}</button>
            <button type="button" disabled={loading} onClick={() => void refreshSchema()} style={btnPlain}>Refresh Schema</button>
          </div>
        </form>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>parser pipeline</summary>
          <pre>{JSON.stringify(pipeline ?? {}, null, 2)}</pre>
        </details>

        <details open style={panelStyle}>
          <summary>semantic normalization strategy</summary>
          <pre>{JSON.stringify(strategy ?? {}, null, 2)}</pre>
        </details>

        <details open style={panelStyle}>
          <summary>页面方案（Document IR -> Semantic IR -> SpecIR）</summary>
          <pre>{JSON.stringify({
            document_ir: result?.document_ir ?? null,
            semantic_ir: result?.semantic_ir ?? null,
            specir: result?.specir ?? null,
            evidence: result?.evidence ?? null,
            normalization_status: result?.normalization_status ?? null,
          }, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

const areaStyle: CSSProperties = {
  width: "100%",
  minHeight: 220,
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #93c5fd",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #bae6fd", borderRadius: 10, padding: 10, background: "#f0f9ff" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #0369a1", background: "#0369a1", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };
