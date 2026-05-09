import { CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import { getAIPatchSchema, listAIPatches, revertAIPatch, reviewAIPatch, suggestAIPatch, type AIPatchCenterResponse } from "./platform/api-client.ts";

const defaultNearbyRules = [
  { slotKey: "compaction_degree", threshold: 95, operator: ">=", formula: "compaction_degree >= 95", gate_logic: "AND" },
];
const defaultHistoricalFixes = [
  { slotKey: "compaction_degree", threshold: 96, operator: ">=", formula: "compaction_degree >= 96", gate_logic: "AND" },
];
const defaultSlotGraph = {
  nodes: [{ id: "compaction_degree", threshold: 95 }],
  edges: [],
};
const defaultSemanticContext = { clause: "4.2.1", semantic_type: "threshold_constraint" };

function parseJsonObject(text: string, label: string): Record<string, unknown> {
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

function parseJsonArray(text: string, label: string): Array<Record<string, unknown>> {
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

export default function AIPatchCenter() {
  const [formCode, setFormCode] = useState("JTG_F80_1_2017.4.2.1.compaction");
  const [unresolvedReason, setUnresolvedReason] = useState("threshold unresolved");
  const [nearbyRulesText, setNearbyRulesText] = useState(JSON.stringify(defaultNearbyRules, null, 2));
  const [slotGraphText, setSlotGraphText] = useState(JSON.stringify(defaultSlotGraph, null, 2));
  const [historicalFixesText, setHistoricalFixesText] = useState(JSON.stringify(defaultHistoricalFixes, null, 2));
  const [semanticContextText, setSemanticContextText] = useState(JSON.stringify(defaultSemanticContext, null, 2));
  const [selectedPatchId, setSelectedPatchId] = useState("");
  const [editPayloadText, setEditPayloadText] = useState("{\n  \"threshold\": 97\n}");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [patches, setPatches] = useState<Array<Record<string, unknown>>>([]);
  const [suggestion, setSuggestion] = useState<AIPatchCenterResponse | null>(null);

  const displayPatches = useMemo(() => {
    const rows = [...patches];
    rows.sort((a, b) => {
      const at = String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
      if (at !== 0) return at;
      return Number(b.version ?? 0) - Number(a.version ?? 0);
    });
    return rows;
  }, [patches]);

  async function loadCenter() {
    setLoading(true);
    setError("");
    try {
      const [schemaResp, listResp] = await Promise.all([getAIPatchSchema(), listAIPatches()]);
      setSchema((schemaResp?.patch_schema ?? null) as Record<string, unknown> | null);
      const items = Array.isArray(listResp?.items) ? listResp.items : [];
      setPatches(items);
      if (!selectedPatchId && items.length > 0) {
        const id = String(items[0]?.patch_id ?? "").trim();
        if (id) setSelectedPatchId(id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCenter();
  }, []);

  async function onSuggest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const resp = await suggestAIPatch({
        form_code: formCode.trim(),
        unresolved_reason: unresolvedReason.trim(),
        nearby_rules: parseJsonArray(nearbyRulesText, "nearby_rules"),
        slot_graph: parseJsonObject(slotGraphText, "slot_graph"),
        historical_fixes: parseJsonArray(historicalFixesText, "historical_fixes"),
        semantic_context: parseJsonObject(semanticContextText, "semantic_context"),
      });
      setSuggestion(resp);
      const patchId = String(resp?.patch_record?.patch_id ?? "").trim();
      if (patchId) setSelectedPatchId(patchId);
      await loadCenter();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function doReview(action: "accept" | "edit" | "reject") {
    if (!selectedPatchId.trim()) return;
    setLoading(true);
    setError("");
    try {
      await reviewAIPatch({
        patch_id: selectedPatchId.trim(),
        action,
        edit_payload: action === "edit" ? parseJsonObject(editPayloadText, "edit_payload") : {},
      });
      await loadCenter();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function doRevert() {
    if (!selectedPatchId.trim()) return;
    setLoading(true);
    setError("");
    try {
      await revertAIPatch({ patch_id: selectedPatchId.trim() });
      await loadCenter();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #f8fafc, #e2e8f0)", color: "#0f172a", padding: 20 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", background: "rgba(255,255,255,0.95)", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>AI Patch Center</h1>
        <p style={{ marginTop: 0 }}>AI auto repair for unresolved SpecIR/Rule. Patch is versioned, reviewable and revertable.</p>

        <form onSubmit={onSuggest} style={{ display: "grid", gap: 10 }}>
          <label>form_code<input value={formCode} onChange={(e) => setFormCode(e.target.value)} style={inputStyle} /></label>
          <label>unresolved reason<input value={unresolvedReason} onChange={(e) => setUnresolvedReason(e.target.value)} style={inputStyle} /></label>
          <label>nearby rules<textarea value={nearbyRulesText} onChange={(e) => setNearbyRulesText(e.target.value)} style={areaStyle} /></label>
          <label>slot graph<textarea value={slotGraphText} onChange={(e) => setSlotGraphText(e.target.value)} style={areaStyle} /></label>
          <label>historical fixes<textarea value={historicalFixesText} onChange={(e) => setHistoricalFixesText(e.target.value)} style={areaStyle} /></label>
          <label>semantic context<textarea value={semanticContextText} onChange={(e) => setSemanticContextText(e.target.value)} style={areaStyle} /></label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" disabled={loading} style={btnDark}>{loading ? "Processing..." : "Generate suggested patch"}</button>
            <button type="button" disabled={loading} onClick={() => void loadCenter()} style={btnPlain}>Reload center</button>
          </div>
        </form>

        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <label>selected patch_id<input value={selectedPatchId} onChange={(e) => setSelectedPatchId(e.target.value)} style={inputStyle} /></label>
          <label>edit payload<textarea value={editPayloadText} onChange={(e) => setEditPayloadText(e.target.value)} style={areaStyle} /></label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" disabled={loading || !selectedPatchId.trim()} onClick={() => void doReview("accept")} style={btnGreen}>accept</button>
            <button type="button" disabled={loading || !selectedPatchId.trim()} onClick={() => void doReview("edit")} style={btnAmber}>edit</button>
            <button type="button" disabled={loading || !selectedPatchId.trim()} onClick={() => void doReview("reject")} style={btnRed}>reject</button>
            <button type="button" disabled={loading || !selectedPatchId.trim()} onClick={() => void doRevert()} style={btnPlain}>revert</button>
          </div>
        </div>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>patch schema</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>

        <details open style={panelStyle}>
          <summary>patch review workflow</summary>
          <pre>{JSON.stringify(suggestion?.patch_review_workflow ?? suggestion?.suggestion_payload?.patch_review_workflow ?? {}, null, 2)}</pre>
        </details>

        <details open style={panelStyle}>
          <summary>revert strategy</summary>
          <pre>{JSON.stringify(suggestion?.revert_strategy ?? suggestion?.suggestion_payload?.revert_strategy ?? {}, null, 2)}</pre>
        </details>

        <details open style={panelStyle}>
          <summary>suggestion payload</summary>
          <pre>{JSON.stringify(suggestion ?? {}, null, 2)}</pre>
        </details>

        <details open style={panelStyle}>
          <summary>versioned patch list</summary>
          <pre>{JSON.stringify(displayPatches, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = { display: "block", width: "100%", padding: "8px 10px", border: "1px solid #94a3b8", borderRadius: 10, marginTop: 4 };
const areaStyle: CSSProperties = { ...inputStyle, minHeight: 90, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" };
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #cbd5e1", borderRadius: 10, padding: 10, background: "#f8fafc" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnBase: CSSProperties = { borderRadius: 10, padding: "8px 12px", border: "1px solid transparent", cursor: "pointer" };
const btnDark: CSSProperties = { ...btnBase, background: "#0f172a", color: "#fff" };
const btnPlain: CSSProperties = { ...btnBase, background: "#e2e8f0", color: "#0f172a", borderColor: "#94a3b8" };
const btnGreen: CSSProperties = { ...btnBase, background: "#047857", color: "#fff" };
const btnAmber: CSSProperties = { ...btnBase, background: "#b45309", color: "#fff" };
const btnRed: CSSProperties = { ...btnBase, background: "#b91c1c", color: "#fff" };

