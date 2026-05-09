import { CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import { buildBimRuntimeLinkage, getBimRuntimeLinkageSchema } from "./platform/api-client.ts";

const DEFAULT_PAYLOAD = {
  bim_objects: [
    {
      bim_object_id: "BIM_COL_001",
      object_type: "PileCap",
      related_form_code: "T0921-2019",
      related_slotKeys: ["compaction_degree", "pile_top_elevation"],
      related_specir_ids: ["JTG_F80_1_2017.4.2.1.compaction"],
    },
    {
      bim_object_id: "BIM_COL_002",
      object_type: "Pile",
      related_form_code: "T1001-2019",
      related_slotKeys: ["pile_top_elevation"],
      related_specir_ids: ["JTG_F80_1_2017.5.1.2.elevation"],
    },
  ],
  specir_records: [
    { specir_id: "JTG_F80_1_2017.4.2.1.compaction", rule_id: "single_point_rule", gate_id: "default_gate", clause_text: "压实度不得小于95%" },
    { specir_id: "JTG_F80_1_2017.5.1.2.elevation", rule_id: "elev_rule", gate_id: "elev_gate", clause_text: "桩顶高程偏差应满足要求" },
  ],
  rule_gate_records: [
    { form_code: "T0921-2019", slotKey: "compaction_degree", rule_id: "single_point_rule", gate_id: "default_gate" },
    { form_code: "T1001-2019", slotKey: "pile_top_elevation", rule_id: "elev_rule", gate_id: "elev_gate" },
  ],
  runtime_results: [
    { form_code: "T0921-2019", slotKey: "compaction_degree", gate_id: "default_gate", result: "FAIL" },
    { form_code: "T1001-2019", slotKey: "pile_top_elevation", gate_id: "elev_gate", result: "PASS" },
  ],
  proof_records: [
    { form_code: "T0921-2019", proof_id: "proof_001", proof_status: "verified" },
    { form_code: "T1001-2019", proof_id: "proof_002", proof_status: "verified" },
  ],
  risk_items: [
    { form_code: "T0921-2019", risk_level: "high", risk_score: 0.82 },
    { form_code: "T1001-2019", risk_level: "low", risk_score: 0.18 },
  ],
  selected_bim_object_id: "BIM_COL_001",
  risk_level_filter: "",
  design_change: { slotKey: "compaction_degree" },
};

function parseObject(text: string): Record<string, unknown> {
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("payload must be JSON object");
  }
  return obj as Record<string, unknown>;
}

export default function BIMRuntimeLinkagePage() {
  const [payloadText, setPayloadText] = useState(JSON.stringify(DEFAULT_PAYLOAD, null, 2));
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [binding, setBinding] = useState<Record<string, unknown> | null>(null);
  const [highlight, setHighlight] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadSchema() {
    const resp = await getBimRuntimeLinkageSchema();
    setSchema((resp?.page_layout ?? null) as Record<string, unknown> | null);
    setBinding((resp?.binding_rules ?? null) as Record<string, unknown> | null);
    setHighlight((resp?.highlight_states ?? null) as Record<string, unknown> | null);
  }

  useEffect(() => {
    void loadSchema();
  }, []);

  async function onBuild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(payloadText);
      const resp = await buildBimRuntimeLinkage(payload as never);
      setResult(resp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const cards = useMemo(() => (Array.isArray(result?.component_cards) ? (result?.component_cards as Array<Record<string, unknown>>) : []), [result]);
  const detail = (result?.selected_component_detail ?? {}) as Record<string, unknown>;
  const impact = (result?.design_change_impact_hint ?? {}) as Record<string, unknown>;

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#f0f9ff,#e0f2fe)", color: "#0c4a6e", padding: 20 }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", background: "rgba(255,255,255,0.96)", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>BIM + Runtime Linkage</h1>
        <p style={{ marginTop: 0 }}>Display compliance state directly on BIM components with runtime/proof/spec traceability.</p>
        <form onSubmit={onBuild}>
          <label>
            Linkage Build Payload
            <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} style={areaStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Building..." : "Build Linkage View"}</button>
            <button type="button" disabled={loading} onClick={() => void loadSchema()} style={btnPlain}>Reload Schema</button>
          </div>
        </form>
        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr 420px", gap: 12, marginTop: 14 }}>
          <section style={panelColStyle}>
            <h3 style={h3Style}>构件列表（按风险可过滤）</h3>
            {cards.map((c) => (
              <div key={String(c.bim_object_id)} style={{ border: "1px solid #bae6fd", borderRadius: 10, padding: 8, marginBottom: 8, background: "#f0f9ff" }}>
                <div style={{ fontWeight: 700 }}>{String(c.bim_object_id)}</div>
                <div style={{ fontSize: 12 }}>risk: {String(c.risk_level)}</div>
                <div style={{ fontSize: 12 }}>highlight: {String(c.highlight_state)}</div>
              </div>
            ))}
          </section>

          <section style={panelColStyle}>
            <h3 style={h3Style}>BIM 模型高亮画布（状态模拟）</h3>
            <div style={{ minHeight: 220, border: "1px dashed #7dd3fc", borderRadius: 10, padding: 10, background: "#f8fdff" }}>
              {cards.length === 0 ? "暂无构件" : cards.map((c) => `${String(c.bim_object_id)} -> ${String(c.highlight_state)}`).join("\n")}
            </div>
            <h3 style={h3Style}>设计参数修改影响 Gate</h3>
            <pre style={preMiniStyle}>{JSON.stringify(impact, null, 2)}</pre>
          </section>

          <section style={panelColStyle}>
            <h3 style={h3Style}>SpecIR / Rule / Gate / Proof</h3>
            <pre style={preMiniStyle}>{JSON.stringify(detail, null, 2)}</pre>
          </section>
        </div>

        <details open style={panelStyle}>
          <summary>1) 页面布局</summary>
          <pre>{JSON.stringify(result?.page_layout ?? schema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>2) BIM 与 Runtime 数据绑定规则</summary>
          <pre>{JSON.stringify(result?.binding_rules ?? binding ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>3) 高亮状态定义</summary>
          <pre>{JSON.stringify(result?.highlight_states ?? highlight ?? {}, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

const areaStyle: CSSProperties = {
  width: "100%",
  minHeight: 260,
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #7dd3fc",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #bae6fd", borderRadius: 10, padding: 10, background: "#f0f9ff" };
const panelColStyle: CSSProperties = { border: "1px solid #bae6fd", borderRadius: 10, padding: 10, background: "#ffffff" };
const preMiniStyle: CSSProperties = { whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 8 };
const h3Style: CSSProperties = { marginTop: 0, marginBottom: 8, fontSize: 14 };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #0369a1", background: "#0369a1", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };

