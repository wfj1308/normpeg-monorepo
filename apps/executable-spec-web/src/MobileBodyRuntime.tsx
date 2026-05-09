import { CSSProperties, useEffect, useMemo, useState } from "react";
import { evaluateMobileBodyRuntime, getMobileBodyRuntimeSchema } from "./platform/api-client.ts";

type OfflineProofItem = {
  id: string;
  form_code: string;
  slotKey: string;
  proof_name: string;
  created_at: string;
  synced: boolean;
  server_ack?: string;
};

const OFFLINE_QUEUE_KEY = "mobile_body_runtime_proof_queue_v1";

export default function MobileBodyRuntime() {
  const [formCode, setFormCode] = useState("T0921-2019");
  const [slotKey, setSlotKey] = useState("compaction_degree");
  const [inputValue, setInputValue] = useState("93");
  const [operator, setOperator] = useState(">=");
  const [threshold, setThreshold] = useState("95");
  const [clauseText, setClauseText] = useState("压实度不得小于95%");
  const [normRef, setNormRef] = useState("JTG F80/1-2017 4.2.1");
  const [proofName, setProofName] = useState("proof_photo_001.jpg");
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);

  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [offlineStrategy, setOfflineStrategy] = useState<Record<string, unknown> | null>(null);
  const [conflictStrategy, setConflictStrategy] = useState<Record<string, unknown> | null>(null);
  const [runtimeCard, setRuntimeCard] = useState<Record<string, unknown> | null>(null);
  const [queue, setQueue] = useState<OfflineProofItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void loadSchema();
    setQueue(readQueue());
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const gateResult = useMemo(() => (runtimeCard?.gate_result as Record<string, unknown> | undefined) ?? {}, [runtimeCard]);
  const gateStatus = String(gateResult.status ?? "-");
  const failView = gateStatus === "FAIL";

  async function loadSchema() {
    try {
      const resp = await getMobileBodyRuntimeSchema();
      setSchema((resp?.mobile_page_structure ?? null) as Record<string, unknown> | null);
      setOfflineStrategy((resp?.offline_sync_strategy ?? null) as Record<string, unknown> | null);
      setConflictStrategy((resp?.data_conflict_resolution ?? null) as Record<string, unknown> | null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function evaluateNow() {
    setLoading(true);
    setError("");
    try {
      const resp = await evaluateMobileBodyRuntime({
        form_code: formCode,
        slotKey,
        input_value: Number(inputValue),
        operator,
        threshold: Number(threshold),
        clause_text: clauseText,
        norm_ref: normRef,
      });
      setRuntimeCard(resp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function addProofToQueue() {
    const item: OfflineProofItem = {
      id: `offline_${Date.now()}`,
      form_code: formCode,
      slotKey,
      proof_name: proofName,
      created_at: new Date().toISOString(),
      synced: false,
    };
    const next = [item, ...queue];
    setQueue(next);
    writeQueue(next);
  }

  function syncProofQueue() {
    if (!isOnline) return;
    const next = queue.map((x) =>
      x.synced ? x : { ...x, synced: true, server_ack: `ack_${Date.now()}_${x.id.slice(-4)}` }
    );
    setQueue(next);
    writeQueue(next);
  }

  return (
    <div style={pageStyle}>
      <div style={phoneShellStyle}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Body-Only Runtime</h2>
        <p style={{ margin: "0 0 10px 0", color: "#475569", fontSize: 13 }}>
          {isOnline ? "在线模式：可实时同步 Proof" : "离线模式：本地缓存，联网后自动同步"}
        </p>

        <Card title="当前表单">
          <input value={formCode} onChange={(e) => setFormCode(e.target.value)} style={inputStyle} />
        </Card>
        <Card title="当前 slot">
          <input value={slotKey} onChange={(e) => setSlotKey(e.target.value)} style={inputStyle} />
        </Card>
        <Card title="输入值">
          <div style={{ display: "flex", gap: 8 }}>
            <input value={inputValue} onChange={(e) => setInputValue(e.target.value)} style={inputStyle} />
            <select value={operator} onChange={(e) => setOperator(e.target.value)} style={inputStyle}>
              <option value=">=">{">="}</option>
              <option value=">">{">"}</option>
              <option value="<=">{"<="}</option>
              <option value="<">{"<"}</option>
            </select>
            <input value={threshold} onChange={(e) => setThreshold(e.target.value)} style={inputStyle} />
          </div>
        </Card>
        <Card title="规范要求（仅当前字段）">
          <input value={clauseText} onChange={(e) => setClauseText(e.target.value)} style={inputStyle} />
          <input value={normRef} onChange={(e) => setNormRef(e.target.value)} style={{ ...inputStyle, marginTop: 6 }} />
        </Card>
        <button onClick={() => void evaluateNow()} disabled={loading} style={primaryBtnStyle}>
          {loading ? "计算中..." : "实时计算 Gate"}
        </button>

        <Card title="Gate 结果">
          <div style={{ fontWeight: 700, color: gateStatus === "PASS" ? "#166534" : gateStatus === "FAIL" ? "#b91c1c" : "#0f172a" }}>
            {gateStatus || "-"}
          </div>
          {failView ? (
            <div style={{ marginTop: 6, fontSize: 13, color: "#7f1d1d" }}>
              失败原因：{String(gateResult.reason ?? "-")}
              <br />
              来源条款：{String(gateResult.source_clause ?? "-")}
            </div>
          ) : (
            <div style={{ marginTop: 6, fontSize: 13, color: "#334155" }}>{String(gateResult.reason ?? "等待计算")}</div>
          )}
        </Card>

        <Card title="Proof 上传入口">
          <input value={proofName} onChange={(e) => setProofName(e.target.value)} style={inputStyle} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={addProofToQueue} style={secondaryBtnStyle}>加入离线队列</button>
            <button onClick={syncProofQueue} style={secondaryBtnStyle} disabled={!isOnline}>联网同步</button>
          </div>
        </Card>

        <Card title="整改建议">
          <div style={{ fontSize: 13, color: "#334155" }}>{String(runtimeCard?.remediation_suggestion ?? "Gate fail 后显示整改建议。")}</div>
        </Card>

        <Card title="离线同步状态">
          <div style={{ fontSize: 12, color: "#475569" }}>待同步：{queue.filter((x) => !x.synced).length}，已同步：{queue.filter((x) => x.synced).length}</div>
        </Card>

        <details style={detailsStyle}>
          <summary>手机端页面结构</summary>
          <pre style={preStyle}>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>
        <details style={detailsStyle}>
          <summary>离线同步策略</summary>
          <pre style={preStyle}>{JSON.stringify(offlineStrategy ?? {}, null, 2)}</pre>
        </details>
        <details style={detailsStyle}>
          <summary>数据冲突处理</summary>
          <pre style={preStyle}>{JSON.stringify(conflictStrategy ?? {}, null, 2)}</pre>
        </details>
        {error ? <div style={{ color: "#b91c1c", fontSize: 12 }}>{error}</div> : null}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function readQueue(): OfflineProofItem[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as OfflineProofItem[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: OfflineProofItem[]) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
}

const pageStyle: CSSProperties = { minHeight: "100vh", background: "#e2e8f0", padding: 12, display: "flex", justifyContent: "center" };
const phoneShellStyle: CSSProperties = { width: 390, maxWidth: "100%", background: "#fff", borderRadius: 18, padding: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.12)" };
const cardStyle: CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 12, padding: 10, marginBottom: 10, background: "#f8fafc" };
const inputStyle: CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid #cbd5e1", boxSizing: "border-box" };
const primaryBtnStyle: CSSProperties = { width: "100%", borderRadius: 10, border: "1px solid #1d4ed8", background: "#1d4ed8", color: "#fff", padding: "9px 12px", marginBottom: 10 };
const secondaryBtnStyle: CSSProperties = { flex: 1, borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 10px" };
const detailsStyle: CSSProperties = { marginBottom: 8, border: "1px solid #cbd5e1", borderRadius: 10, padding: 8, background: "#f8fafc" };
const preStyle: CSSProperties = { whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 11 };

