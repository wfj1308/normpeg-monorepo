import { CSSProperties, FormEvent, useEffect, useState } from "react";
import {
  getRuntimeMemoryReasoningContext,
  getRuntimeMemorySchema,
  listRuntimeMemory,
  retrieveRuntimeMemory,
  suggestRuntimeMemoryReuse,
  upsertRuntimeMemory,
} from "./platform/api-client.ts";

const DEFAULT_UPSERT_PAYLOAD = {
  memory_type: "successful_remediation",
  project_id: "P1",
  form_code: "T0921-2019",
  slotKey: "compaction_degree",
  gate_id: "gate_compaction_min",
  issue_signature: "compaction_below_threshold",
  tags: ["compaction", "moisture", "roller_pass"],
  payload: {
    action: "increase roller pass from 4 to 6 and reduce moisture",
    before: { compaction_degree: 94.2, moisture_content: 7.1 },
    after: { compaction_degree: 96.4, moisture_content: 5.8 },
  },
  success_score: 0.93,
};

const DEFAULT_RETRIEVE_PAYLOAD = {
  issue_signature: "compaction_below_threshold",
  slotKey: "compaction_degree",
  gate_id: "gate_compaction_min",
  tags: ["compaction", "roller_pass"],
  project_id: "P1",
  limit: 20,
  prefer_success: true,
};

function parseObject(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("payload must be JSON object");
  }
  return parsed as Record<string, unknown>;
}

export default function RuntimeMemoryExplorer() {
  const [projectId, setProjectId] = useState("P1");
  const [upsertText, setUpsertText] = useState(JSON.stringify(DEFAULT_UPSERT_PAYLOAD, null, 2));
  const [retrieveText, setRetrieveText] = useState(JSON.stringify(DEFAULT_RETRIEVE_PAYLOAD, null, 2));
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [memoryItems, setMemoryItems] = useState<Array<Record<string, unknown>>>([]);
  const [retrieval, setRetrieval] = useState<Record<string, unknown> | null>(null);
  const [reasoningContext, setReasoningContext] = useState<Record<string, unknown> | null>(null);
  const [aiReuse, setAiReuse] = useState<Record<string, unknown> | null>(null);
  const [upsertResult, setUpsertResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshSchema() {
    const resp = await getRuntimeMemorySchema();
    setSchema(resp as Record<string, unknown>);
  }

  async function refreshList() {
    const resp = await listRuntimeMemory({ project_id: projectId.trim() || undefined, limit: 200 });
    setMemoryItems(Array.isArray(resp?.items) ? resp.items : []);
  }

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError("");
      try {
        await Promise.all([refreshSchema(), refreshList()]);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onUpsert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(upsertText);
      const resp = await upsertRuntimeMemory(payload as never);
      setUpsertResult(resp as Record<string, unknown>);
      await refreshList();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onRetrieve() {
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(retrieveText);
      const [retrieved, context, reuse] = await Promise.all([
        retrieveRuntimeMemory(payload as never),
        getRuntimeMemoryReasoningContext(payload as never),
        suggestRuntimeMemoryReuse(payload as never),
      ]);
      setRetrieval(retrieved as Record<string, unknown>);
      setReasoningContext(context as Record<string, unknown>);
      setAiReuse(reuse as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#eff6ff,#fefce8)", color: "#0f172a", padding: 20 }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", background: "#ffffffec", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Runtime Memory Explorer</h1>
        <p style={{ marginTop: 0 }}>Persist historical runtime experience and reuse successful cases in reasoning and AI remediation suggestions.</p>

        <form onSubmit={onUpsert}>
          <label>
            Project ID Filter
            <input value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle} />
          </label>
          <label>
            Upsert Memory Payload
            <textarea value={upsertText} onChange={(e) => setUpsertText(e.target.value)} style={areaStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Saving..." : "Upsert Memory"}</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void refreshList()}>Refresh Memory List</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void refreshSchema()}>Refresh Schema</button>
          </div>
        </form>

        <div style={{ marginTop: 12 }}>
          <label>
            Retrieval Payload (for reasoning + AI reuse)
            <textarea value={retrieveText} onChange={(e) => setRetrieveText(e.target.value)} style={areaStyle} />
          </label>
          <button type="button" disabled={loading} style={btnStrong} onClick={() => void onRetrieve()}>
            {loading ? "Querying..." : "Retrieve Memory / Build Context / Suggest Reuse"}
          </button>
        </div>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>memory schema + retrieval strategy + page plan</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>upsert result</summary>
          <pre>{JSON.stringify(upsertResult ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>memory list</summary>
          <pre>{JSON.stringify(memoryItems, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>retrieval result</summary>
          <pre>{JSON.stringify(retrieval ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>reasoning context (historical memory referenced)</summary>
          <pre>{JSON.stringify(reasoningContext ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>ai reuse suggestion (prefer historical success)</summary>
          <pre>{JSON.stringify(aiReuse ?? {}, null, 2)}</pre>
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
  border: "1px solid #bfdbfe",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const inputStyle: CSSProperties = {
  width: "100%",
  marginTop: 6,
  marginBottom: 8,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #bfdbfe",
  boxSizing: "border-box",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #bfdbfe", borderRadius: 10, padding: 10, background: "#f8fafc" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #1d4ed8", background: "#1d4ed8", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };
const btnStrong: CSSProperties = { marginTop: 10, borderRadius: 10, border: "1px solid #0f172a", background: "#0f172a", color: "#fff", padding: "8px 12px", cursor: "pointer" };
