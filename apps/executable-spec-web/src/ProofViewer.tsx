import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { appendUnifiedProof, getUnifiedProofSchema, listUnifiedProof } from "./platform/api-client.ts";

const DEFAULT_PROOF = {
  project_id: "P1",
  form_code: "T0921-2019",
  slotKey: "compaction_degree",
  body_snapshot: {
    body_id: "body_001",
    slotKey: "compaction_degree",
    value: 93,
    unit: "%",
    source_type: "Manual",
    confidence: 0.93,
  },
  gate_snapshot: {
    gate_id: "gate_compaction_threshold",
    gate_type: "threshold",
    threshold: 95,
    severity: "reject",
    runtime_mode: "automatic",
    condition: "compaction_degree >= 95",
  },
  calculation_trace: [{ step: "compare", expression: "93 >= 95", passed: false }],
  result: "FAIL",
  fail_reason: "value 93 < threshold 95",
  evidence_refs: [{ file_name: "site_photo_001.jpg", uri: "oss://demo/site_photo_001.jpg" }],
  operator: "eng_001",
  signature: "operator-signature-demo",
  specir: "JTG_F80_1_2017.4.2.1.compaction",
  rule: "rule.compaction.minimum",
  normRef: "JTG F80/1-2017 4.2.1",
};

function parseObject(text: string): Record<string, unknown> {
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("payload must be JSON object");
  }
  return obj as Record<string, unknown>;
}

export default function ProofViewer() {
  const [projectId, setProjectId] = useState("P1");
  const [payloadText, setPayloadText] = useState(JSON.stringify(DEFAULT_PROOF, null, 2));
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [hashChain, setHashChain] = useState<Record<string, unknown> | null>(null);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [lastWrite, setLastWrite] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshAll() {
    setLoading(true);
    setError("");
    try {
      const [schemaResp, listResp] = await Promise.all([getUnifiedProofSchema(), listUnifiedProof(projectId, 200)]);
      setSchema((schemaResp?.proof_schema ?? null) as Record<string, unknown> | null);
      setHashChain((schemaResp?.hash_chain ?? null) as Record<string, unknown> | null);
      setItems(Array.isArray(listResp?.items) ? listResp.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  async function onAppend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(payloadText);
      const resp = await appendUnifiedProof(payload as never);
      setLastWrite((resp?.item ?? null) as Record<string, unknown> | null);
      const nextProject = String((payload as Record<string, unknown>).project_id ?? "").trim();
      if (nextProject) {
        setProjectId(nextProject);
      }
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const display = {
    input_values: lastWrite?.body_snapshot ?? null,
    judgement_logic: lastWrite?.gate_snapshot ?? null,
    calculation_process: lastWrite?.calculation_trace ?? null,
    norm_source: {
      specir: lastWrite?.traceability && typeof lastWrite.traceability === "object" ? (lastWrite.traceability as Record<string, unknown>).specir : null,
      normRef: lastWrite?.traceability && typeof lastWrite.traceability === "object" ? (lastWrite.traceability as Record<string, unknown>).normRef : null,
      rule: lastWrite?.traceability && typeof lastWrite.traceability === "object" ? (lastWrite.traceability as Record<string, unknown>).rule : null,
    },
    hash: lastWrite?.hash ?? null,
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#fff7ed,#ffedd5)", color: "#7c2d12", padding: 20 }}>
      <div style={{ maxWidth: 1300, margin: "0 auto", background: "rgba(255,255,255,0.96)", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Proof Viewer</h1>
        <p style={{ marginTop: 0 }}>Unified append-only proof chain with full Body/Gate/SpecIR/normRef traceability.</p>

        <form onSubmit={onAppend}>
          <label>
            Project ID
            <input value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle} />
          </label>
          <label>
            Unified Proof Payload
            <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} style={areaStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Appending..." : "Append Proof"}</button>
            <button type="button" disabled={loading} onClick={() => void refreshAll()} style={btnPlain}>Refresh</button>
          </div>
        </form>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>输入值 / 判定逻辑 / 计算过程 / 规范来源 / hash</summary>
          <pre>{JSON.stringify(display, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>proof schema</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>hash chain</summary>
          <pre>{JSON.stringify(hashChain ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>页面方案（写入结果 + proof 列表）</summary>
          <pre>{JSON.stringify({ last_write: lastWrite ?? {}, proof_items: items }, null, 2)}</pre>
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
  border: "1px solid #fdba74",
  boxSizing: "border-box",
};

const areaStyle: CSSProperties = {
  width: "100%",
  minHeight: 220,
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #fdba74",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};

const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #fed7aa", borderRadius: 10, padding: 10, background: "#fff7ed" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #c2410c", background: "#c2410c", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };
