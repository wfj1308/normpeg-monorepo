import { CSSProperties, useEffect, useState } from "react";
import {
  getImmutableProofChainSchema,
  getImmutableProofLineage,
  getImmutableProofOverrideHistory,
  listImmutableProofChain,
  replayImmutableProof,
} from "./platform/api-client.ts";

export default function ProofChainViewer() {
  const [projectId, setProjectId] = useState("P1");
  const [selectedProofId, setSelectedProofId] = useState("");
  const [replayOperator, setReplayOperator] = useState("replay_operator");
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [hashStrategy, setHashStrategy] = useState<Record<string, unknown> | null>(null);
  const [integrityRules, setIntegrityRules] = useState<string[]>([]);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [lineage, setLineage] = useState<Array<Record<string, unknown>>>([]);
  const [overrideHistory, setOverrideHistory] = useState<Array<Record<string, unknown>>>([]);
  const [replayDiff, setReplayDiff] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshAll() {
    setLoading(true);
    setError("");
    try {
      const [schemaResp, listResp] = await Promise.all([
        getImmutableProofChainSchema(),
        listImmutableProofChain({ project_id: projectId.trim() || undefined, limit: 2000 }),
      ]);
      setSchema((schemaResp?.proof_chain_schema ?? null) as Record<string, unknown> | null);
      setHashStrategy((schemaResp?.hash_chain_strategy ?? null) as Record<string, unknown> | null);
      setIntegrityRules(Array.isArray(schemaResp?.replay_integrity_rules) ? schemaResp.replay_integrity_rules : []);
      const chainItems = Array.isArray(listResp?.items) ? listResp.items : [];
      setItems(chainItems);
      if (!selectedProofId && chainItems.length > 0) {
        setSelectedProofId(String(chainItems[0].proof_id ?? ""));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  useEffect(() => {
    async function loadProofDetails() {
      if (!selectedProofId.trim()) return;
      setLoading(true);
      setError("");
      try {
        const [lineageResp, historyResp] = await Promise.all([
          getImmutableProofLineage(selectedProofId.trim()),
          getImmutableProofOverrideHistory(selectedProofId.trim()),
        ]);
        setLineage(Array.isArray(lineageResp?.lineage) ? lineageResp.lineage : []);
        setOverrideHistory(Array.isArray(historyResp?.items) ? historyResp.items : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    void loadProofDetails();
  }, [selectedProofId]);

  async function onReplay() {
    if (!selectedProofId.trim()) return;
    setLoading(true);
    setError("");
    try {
      const resp = await replayImmutableProof(selectedProofId.trim(), replayOperator.trim() || "replay_operator");
      setReplayDiff((resp?.replay_diff ?? null) as Record<string, unknown> | null);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#fff1f2,#f8fafc)", color: "#0f172a", padding: 20 }}>
      <div style={{ maxWidth: 1300, margin: "0 auto", background: "#ffffffee", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Proof Chain Viewer</h1>
        <p style={{ marginTop: 0 }}>Immutable runtime evidence chain.</p>

        <label>
          Project ID
          <input value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle} />
        </label>
        <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
          <button type="button" style={btnPrimary} disabled={loading} onClick={() => void refreshAll()}>{loading ? "Loading..." : "Refresh Chain"}</button>
        </div>

        <label>
          Select Proof ID
          <input value={selectedProofId} onChange={(e) => setSelectedProofId(e.target.value)} style={inputStyle} />
        </label>
        <label>
          Replay Operator
          <input value={replayOperator} onChange={(e) => setReplayOperator(e.target.value)} style={inputStyle} />
        </label>
        <button type="button" style={btnPlain} disabled={loading} onClick={() => void onReplay()}>Replay (Append New Proof)</button>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>proof chain schema</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>hash chain strategy</summary>
          <pre>{JSON.stringify(hashStrategy ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>replay integrity rules</summary>
          <pre>{JSON.stringify(integrityRules, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>proof lineage</summary>
          <pre>{JSON.stringify(lineage, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>override history</summary>
          <pre>{JSON.stringify(overrideHistory, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>replay diff</summary>
          <pre>{JSON.stringify(replayDiff ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>chain items</summary>
          <pre>{JSON.stringify(items, null, 2)}</pre>
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
  border: "1px solid #fecdd3",
  boxSizing: "border-box",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #fecdd3", borderRadius: 10, padding: 10, background: "#fff1f2" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #be123c", background: "#be123c", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };
