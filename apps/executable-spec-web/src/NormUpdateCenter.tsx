import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { getNormSubscriptionSchema, runNormSubscription, type NormSubscriptionResponse } from "./platform/api-client.ts";

const DEFAULT_SOURCES = [
  { source_id: "mot", name: "交通部", type: "government" },
  { source_id: "mohurd", name: "住建部", type: "government" },
  { source_id: "enterprise", name: "企业标准源", type: "enterprise" },
];

const DEFAULT_DISCOVERED = [
  { norm_id: "MOT-NEW-2026-001", title: "交通部新规范示例" },
  { norm_id: "MOHURD-NEW-2026-001", title: "住建部新规范示例" },
];

function parseArray(text: string, label: string): Array<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array`);
  }
  return parsed.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as Array<Record<string, unknown>>;
}

export default function NormUpdateCenter() {
  const [sourcesText, setSourcesText] = useState(JSON.stringify(DEFAULT_SOURCES, null, 2));
  const [discoveredText, setDiscoveredText] = useState(JSON.stringify(DEFAULT_DISCOVERED, null, 2));
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<NormSubscriptionResponse | null>(null);

  async function loadSchema() {
    setLoading(true);
    setError("");
    try {
      const resp = await getNormSubscriptionSchema();
      setSchema((resp?.subscription_schema ?? null) as Record<string, unknown> | null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSchema();
  }, []);

  async function onRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const resp = await runNormSubscription({
        sources: parseArray(sourcesText, "sources"),
        discovered_norms: parseArray(discoveredText, "discovered_norms"),
        dry_run: dryRun,
      });
      setResult(resp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #f0f9ff, #e0f2fe)", color: "#0c4a6e", padding: 20 }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", background: "rgba(255,255,255,0.95)", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Norm Update Center</h1>
        <p style={{ marginTop: 0 }}>Auto discover and ingest new norms with PDF → IR → SpecIR → Diff → Impact → Patch Suggestion.</p>

        <form onSubmit={onRun}>
          <label>sources monitor list<textarea value={sourcesText} onChange={(e) => setSourcesText(e.target.value)} style={areaStyle} /></label>
          <label>discovered norms<textarea value={discoveredText} onChange={(e) => setDiscoveredText(e.target.value)} style={areaStyle} /></label>
          <label style={{ display: "block", marginTop: 8 }}>
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} /> dry-run
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Running..." : "Run Auto Subscription"}</button>
            <button type="button" disabled={loading} onClick={() => void loadSchema()} style={btnPlain}>Reload Schema</button>
          </div>
        </form>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>source monitor</summary>
          <pre>{JSON.stringify(result?.source_monitor ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>auto ingestion pipeline</summary>
          <pre>{JSON.stringify(result?.auto_ingestion_pipeline ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>update workflow</summary>
          <pre>{JSON.stringify(result?.update_workflow ?? {}, null, 2)}</pre>
        </details>
        <details style={panelStyle}>
          <summary>subscription schema</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

const areaStyle: CSSProperties = {
  width: "100%",
  minHeight: 120,
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #7dd3fc",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #bae6fd", borderRadius: 10, padding: 10, background: "#f0f9ff" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #0369a1", background: "#0369a1", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#f8fafc", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };

