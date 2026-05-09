import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { analyzeBimMappingImpact, getBimMappingSchema, listBimObjectMappings, upsertBimObjectMapping } from "./platform/api-client.ts";

const DEFAULT_BIM = {
  bim_object_id: "BIM_COL_001",
  object_type: "PileCap",
  location: { level: "L1", axis: "K19+070", x: 128.25, y: 62.5, z: 135.4 },
  project_id: "P1",
  related_form_code: "T0921-2019",
  related_slotKeys: ["compaction_degree", "pile_top_elevation"],
  related_specir_ids: ["JTG_F80_1_2017.4.2.1.compaction"],
  geometry_ref: "bim://model/main.ifc#id=COL_001",
  metadata: { material: "C30", discipline: "roadbed" },
};

const DEFAULT_IMPACT = {
  project_id: "P1",
  slotKey: "compaction_degree",
  gate_failed: { gate_id: "default_gate", slotKey: "compaction_degree", result: "FAIL" },
  bim_update: { bim_object_id: "BIM_COL_001", rule_ids: ["single_point_rule"], gate_ids: ["default_gate"] },
};

function parseObject(text: string): Record<string, unknown> {
  const v = JSON.parse(text);
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("must be JSON object");
  }
  return v as Record<string, unknown>;
}

export default function BIMMappingStudio() {
  const [projectId, setProjectId] = useState("P1");
  const [bimText, setBimText] = useState(JSON.stringify(DEFAULT_BIM, null, 2));
  const [impactText, setImpactText] = useState(JSON.stringify(DEFAULT_IMPACT, null, 2));
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [impactResult, setImpactResult] = useState<Record<string, unknown> | null>(null);
  const [lastUpsert, setLastUpsert] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshAll(pid = projectId) {
    setLoading(true);
    setError("");
    try {
      const [s, list, impact] = await Promise.all([
        getBimMappingSchema(),
        listBimObjectMappings(pid),
        analyzeBimMappingImpact(parseObject(impactText) as never),
      ]);
      setSchema((s?.bim_mapping_schema ?? null) as Record<string, unknown> | null);
      setItems(Array.isArray(list?.items) ? list.items : []);
      setImpactResult(impact);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  async function onUpsert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(bimText);
      const resp = await upsertBimObjectMapping(payload as never);
      setLastUpsert(resp);
      const nextProjectId = String((payload as Record<string, unknown>).project_id ?? "").trim();
      if (nextProjectId) {
        setProjectId(nextProjectId);
      }
      await refreshAll(nextProjectId || projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#ecfeff,#cffafe)", color: "#083344", padding: 20 }}>
      <div style={{ maxWidth: 1300, margin: "0 auto", background: "rgba(255,255,255,0.96)", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>BIM Mapping Studio</h1>
        <p style={{ marginTop: 0 }}>Map BIM objects to slotKey/Form/SpecIR with reverse lookup, gate-failed highlight, and BIM-update recheck.</p>
        <form onSubmit={onUpsert}>
          <label>
            Project ID
            <input value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle} />
          </label>
          <label>
            BIM Object Payload
            <textarea value={bimText} onChange={(e) => setBimText(e.target.value)} style={areaStyle} />
          </label>
          <label>
            Impact Input
            <textarea value={impactText} onChange={(e) => setImpactText(e.target.value)} style={areaStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Saving..." : "Upsert BIM Mapping"}</button>
            <button type="button" disabled={loading} onClick={() => void refreshAll()} style={btnPlain}>Refresh</button>
          </div>
        </form>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>1) BIM mapping schema</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>2) 影响分析逻辑</summary>
          <pre>{JSON.stringify(impactResult ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>3) BIM 高亮交互方案（规则失败高亮 + 反向定位 + 更新触发复检）</summary>
          <pre>{JSON.stringify({ last_upsert: lastUpsert ?? {}, mapped_objects: items, highlight_plan: impactResult?.highlight_targets ?? [] }, null, 2)}</pre>
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
  border: "1px solid #67e8f9",
  boxSizing: "border-box",
};
const areaStyle: CSSProperties = {
  width: "100%",
  minHeight: 170,
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #67e8f9",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #a5f3fc", borderRadius: 10, padding: 10, background: "#ecfeff" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #0e7490", background: "#0e7490", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };

