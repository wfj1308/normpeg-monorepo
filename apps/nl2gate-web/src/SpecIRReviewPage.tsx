import { useEffect, useMemo, useState } from "react";

type SpecIRItem = {
  specir_id?: string;
  status?: string;
  source?: { source_text?: string; page_no?: number };
  semantic?: Record<string, unknown>;
  body?: Record<string, unknown>;
  gate?: Record<string, unknown>;
  quality?: { unresolved_reason?: string; confidence?: number };
};

type ReviewQueueResp = {
  status?: string;
  parse_id?: string;
  summary?: { total?: number; auto_candidate?: number; review_required?: number };
  auto_candidate?: SpecIRItem[];
  review_queue?: SpecIRItem[];
};

function pretty(v: unknown): string {
  try {
    return JSON.stringify(v ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

export default function SpecIRReviewPage() {
  const search = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const parseId = search.get("parse_id") || "parse_demo";
  const apiBase = search.get("api_base") || "/api";

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");
  const [queue, setQueue] = useState<ReviewQueueResp | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [reason, setReason] = useState("");
  const [editJson, setEditJson] = useState("{}");

  const items = useMemo(() => (Array.isArray(queue?.review_queue) ? queue?.review_queue || [] : []), [queue]);
  const selected = useMemo(() => items.find((x) => String(x.specir_id || "") === selectedId) || items[0] || null, [items, selectedId]);

  async function loadQueue(): Promise<void> {
    setLoading(true);
    setMsg("");
    try {
      const resp = await fetch(`${apiBase}/v1/pdf/specir/review-queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parse_id: parseId }),
      });
      const payload = await resp.json() as ReviewQueueResp;
      setQueue(payload);
      const firstId = String((payload.review_queue || [])[0]?.specir_id || "");
      if (firstId) setSelectedId(firstId);
    } catch (e) {
      setMsg(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function decide(action: "approve" | "reject" | "edit"): Promise<void> {
    if (!selected?.specir_id) return;
    setSubmitting(true);
    setMsg("");
    try {
      let patch: Record<string, unknown> = {};
      if (action === "edit") {
        try {
          patch = JSON.parse(editJson || "{}") as Record<string, unknown>;
        } catch {
          setMsg("edit patch 不是合法 JSON");
          setSubmitting(false);
          return;
        }
      }
      const resp = await fetch(`${apiBase}/v1/pdf/specir/review-queue/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parse_id: parseId,
          specir_id: selected.specir_id,
          action,
          editor_id: "reviewer_001",
          reason,
          patch,
        }),
      });
      const out = await resp.json();
      setMsg(`已提交: ${action} (${String(out.status || "-")})`);
      await loadQueue();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    void loadQueue();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">SpecIR Review Queue</h1>
          <button onClick={() => void loadQueue()} className="rounded bg-slate-700 px-3 py-1 text-sm">刷新</button>
        </div>
        <p className="text-xs text-slate-300">parse_id: {parseId} | total: {queue?.summary?.total || 0} | auto_candidate: {queue?.summary?.auto_candidate || 0} | review_required: {queue?.summary?.review_required || 0}</p>
        {loading ? <p>加载中...</p> : null}
        {msg ? <p className="rounded bg-slate-900 p-2 text-sm">{msg}</p> : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          <div className="max-h-[70vh] space-y-2 overflow-auto rounded border border-slate-800 bg-slate-900 p-3">
            {items.map((it) => {
              const sid = String(it.specir_id || "");
              const active = sid === String(selected?.specir_id || "");
              return (
                <button key={sid} onClick={() => setSelectedId(sid)} className={`w-full rounded border p-2 text-left text-xs ${active ? "border-cyan-500 bg-cyan-900/20" : "border-slate-700 bg-slate-950/50"}`}>
                  <p className="font-mono">{sid}</p>
                  <p>confidence: {Number(it.quality?.confidence || 0).toFixed(3)}</p>
                  <p>unresolved_reason: {String(it.quality?.unresolved_reason || "-")}</p>
                </button>
              );
            })}
          </div>

          <div className="space-y-3 rounded border border-slate-800 bg-slate-900 p-3 text-sm">
            {!selected ? <p>暂无待审核条目。</p> : (
              <>
                <p><span className="text-slate-400">source_text:</span> {String(selected.source?.source_text || "-")}</p>
                <p><span className="text-slate-400">page_no:</span> {Number(selected.source?.page_no || 0) || "-"}</p>
                <p><span className="text-slate-400">unresolved_reason:</span> {String(selected.quality?.unresolved_reason || "-")}</p>
                <div><p className="text-slate-300">semantic</p><pre className="rounded bg-slate-950 p-2 text-xs">{pretty(selected.semantic)}</pre></div>
                <div><p className="text-slate-300">body</p><pre className="rounded bg-slate-950 p-2 text-xs">{pretty(selected.body)}</pre></div>
                <div><p className="text-slate-300">gate</p><pre className="rounded bg-slate-950 p-2 text-xs">{pretty(selected.gate)}</pre></div>

                <div className="grid grid-cols-1 gap-2">
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="reject reason / review comment" className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs" />
                  <textarea value={editJson} onChange={(e) => setEditJson(e.target.value)} className="h-28 rounded border border-slate-700 bg-slate-950 p-2 font-mono text-xs" placeholder='{"semantic":{"condition":"..."}}' />
                </div>

                <div className="flex gap-2">
                  <button disabled={submitting} onClick={() => void decide("approve")} className="rounded bg-emerald-600 px-3 py-2 text-xs disabled:opacity-50">approve</button>
                  <button disabled={submitting} onClick={() => void decide("reject")} className="rounded bg-rose-700 px-3 py-2 text-xs disabled:opacity-50">reject</button>
                  <button disabled={submitting} onClick={() => void decide("edit")} className="rounded bg-amber-600 px-3 py-2 text-xs disabled:opacity-50">edit</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

