import { CSSProperties, useEffect, useState } from "react";
import { getBodyLifecycle, getBodySchema, listBodies } from "./platform/api-client.ts";

export default function BodyCenter() {
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [lifecycle, setLifecycle] = useState<Record<string, unknown> | null>(null);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshAll() {
    setLoading(true);
    setError("");
    try {
      const [schemaResp, lifecycleResp, listResp] = await Promise.all([
        getBodySchema(),
        getBodyLifecycle(),
        listBodies({ limit: 200 }),
      ]);
      setSchema((schemaResp?.body_schema ?? null) as Record<string, unknown> | null);
      setLifecycle((lifecycleResp?.body_lifecycle ?? null) as Record<string, unknown> | null);
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

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(145deg,#f7f9fc,#e9f2fb)", color: "#0f172a", padding: 20 }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", background: "#ffffffe8", borderRadius: 16, padding: 20, border: "1px solid #dbe4ef" }}>
        <h1 style={{ marginTop: 0 }}>Body Center</h1>
        <p style={{ marginTop: 0 }}>
          Unified Body view: current value, source, unit, confidence, and last updated. All records are traceable to slotKey / SpecIR / form_code.
        </p>

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <button type="button" style={btnPrimary} onClick={() => void refreshAll()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <a href="/knowledge-graph-explorer" style={traceLink}>Trace to SpecIR</a>
        </div>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <div style={{ overflowX: "auto", border: "1px solid #d0d7de", borderRadius: 10, background: "#fff" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f6f8fa" }}>
                <th style={th}>slotKey</th>
                <th style={th}>label</th>
                <th style={th}>current value</th>
                <th style={th}>unit</th>
                <th style={th}>source</th>
                <th style={th}>confidence</th>
                <th style={th}>runtime status</th>
                <th style={th}>last updated</th>
                <th style={th}>SpecIR</th>
                <th style={th}>form_code</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={String(item.body_id ?? Math.random())}>
                  <td style={td}>{String(item.slotKey ?? "")}</td>
                  <td style={td}>{String(item.label ?? "")}</td>
                  <td style={td}>{typeof item.value === "object" ? JSON.stringify(item.value) : String(item.value ?? "")}</td>
                  <td style={td}>{String(item.unit ?? "")}</td>
                  <td style={td}>{String(item.source_type ?? "")} {item.source_ref ? `(${String(item.source_ref)})` : ""}</td>
                  <td style={td}>{String(item.confidence ?? "")}</td>
                  <td style={td}>{String(item.runtime_status ?? "")}</td>
                  <td style={td}>{String(item.updated_at ?? "")}</td>
                  <td style={td}>{String(item.specir ?? "")}</td>
                  <td style={td}>{String(item.form_code ?? "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <details open style={panelStyle}>
          <summary>body schema</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>

        <details open style={panelStyle}>
          <summary>lifecycle</summary>
          <pre>{JSON.stringify(lifecycle ?? {}, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

const th: CSSProperties = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #d0d7de", whiteSpace: "nowrap" };
const td: CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #eef2f6", verticalAlign: "top" };
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #cbd5e1", borderRadius: 10, padding: 10, background: "#f8fafc" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #0f172a", background: "#0f172a", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const traceLink: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", textDecoration: "none" };
