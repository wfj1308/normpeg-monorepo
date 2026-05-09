import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { getCrossFormPropagationSchema, previewCrossFormPropagation, type CrossFormPropagationResponse } from "./platform/api-client.ts";

const SAMPLE_SPECIR = {
  specir_id: "JTG_F80_1_2017.4.2.1.compaction",
  slotKey: "compaction_degree",
  rule: { operator: ">=", threshold: 95, unit: "%" },
  semantic_text: "Compaction degree representative value must be >=95.",
};

const SAMPLE_SLOT_GRAPH = {
  nodes: [{ id: "compaction_degree" }, { id: "sample_count" }],
  edges: [{ from: "compaction_degree", to: "sample_count" }],
};

const SAMPLE_BLUEPRINT = {
  forms: [
    { form_code: "T0921-2019", fields: ["compaction_degree", "sample_count", "station"] },
    { form_code: "T0912-2019", fields: ["thickness", "station"] },
    { form_code: "T0951-2008", fields: ["deflection", "temperature"] },
  ],
};

const SAMPLE_HISTORY = [
  { form_code: "T0921-2019", usage: 120 },
  { form_code: "T0921-2019", usage: 87 },
  { form_code: "T0912-2019", usage: 64 },
];

function parseObject(text: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

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

export default function PropagationPreview() {
  const [specirText, setSpecirText] = useState(JSON.stringify(SAMPLE_SPECIR, null, 2));
  const [slotGraphText, setSlotGraphText] = useState(JSON.stringify(SAMPLE_SLOT_GRAPH, null, 2));
  const [blueprintText, setBlueprintText] = useState(JSON.stringify(SAMPLE_BLUEPRINT, null, 2));
  const [historyText, setHistoryText] = useState(JSON.stringify(SAMPLE_HISTORY, null, 2));
  const [dryRun, setDryRun] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<CrossFormPropagationResponse | null>(null);

  async function loadSchema() {
    setLoading(true);
    setError("");
    try {
      const resp = await getCrossFormPropagationSchema();
      setSchema((resp?.propagation_schema ?? null) as Record<string, unknown> | null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSchema();
  }, []);

  async function onPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const resp = await previewCrossFormPropagation({
        specir: parseObject(specirText, "SpecIR"),
        slot_graph: parseObject(slotGraphText, "Slot Graph"),
        form_blueprint: parseObject(blueprintText, "Form Blueprint"),
        historical_usage: parseArray(historyText, "Historical usage"),
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
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #ecfeff, #cffafe)", color: "#0f172a", padding: 20 }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", background: "rgba(255,255,255,0.95)", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Propagation Preview</h1>
        <p style={{ marginTop: 0 }}>Cross-Form AI Propagation with confidence, reasoning, and dry-run preview.</p>

        <form onSubmit={onPreview}>
          <label>SpecIR<textarea value={specirText} onChange={(e) => setSpecirText(e.target.value)} style={areaStyle} /></label>
          <label>Slot Graph<textarea value={slotGraphText} onChange={(e) => setSlotGraphText(e.target.value)} style={areaStyle} /></label>
          <label>Form Blueprint<textarea value={blueprintText} onChange={(e) => setBlueprintText(e.target.value)} style={areaStyle} /></label>
          <label>Historical usage<textarea value={historyText} onChange={(e) => setHistoryText(e.target.value)} style={areaStyle} /></label>
          <label style={{ display: "block", marginTop: 8 }}>
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} /> dry-run
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Running..." : "Run Propagation Preview"}</button>
            <button type="button" disabled={loading} onClick={() => void loadSchema()} style={btnPlain}>Reload Schema</button>
          </div>
        </form>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>propagation engine</summary>
          <pre>{JSON.stringify(result?.propagation_engine ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>impact reasoning</summary>
          <pre>{JSON.stringify(result?.impact_reasoning ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>preview workflow</summary>
          <pre>{JSON.stringify(result?.preview_workflow ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>affected_forms[]</summary>
          <pre>{JSON.stringify(result?.affected_forms ?? [], null, 2)}</pre>
        </details>
        <details style={panelStyle}>
          <summary>propagation schema</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

const areaStyle: CSSProperties = {
  width: "100%",
  minHeight: 110,
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #67e8f9",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #a5f3fc", borderRadius: 10, padding: 10, background: "#ecfeff" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #0f766e", background: "#0f766e", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#f8fafc", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };

