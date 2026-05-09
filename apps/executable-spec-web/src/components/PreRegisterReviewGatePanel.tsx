import type { PreRegisterReviewResult } from "../platform/api-client.ts";

type PreRegisterReviewGatePanelProps = {
  review: PreRegisterReviewResult | null;
};

function statusBadgeClass(status: "blocked" | "warning" | "ready"): string {
  if (status === "blocked") {
    return "border-rose-300 bg-rose-50 text-rose-700";
  }
  if (status === "warning") {
    return "border-amber-300 bg-amber-50 text-amber-800";
  }
  return "border-emerald-300 bg-emerald-50 text-emerald-800";
}

function buildConclusion(status: "blocked" | "warning" | "ready"): string {
  if (status === "blocked") {
    return "当前不允许注册，请先处理高风险阻断项。";
  }
  if (status === "warning") {
    return "允许注册，但存在需人工关注项。";
  }
  return "已满足注册条件，可直接继续。";
}

function statusLabel(status: "blocked" | "warning" | "ready"): string {
  if (status === "blocked") {
    return "🔴 blocked";
  }
  if (status === "warning") {
    return "🟡 warning";
  }
  return "🟢 ready";
}

export default function PreRegisterReviewGatePanel(props: PreRegisterReviewGatePanelProps) {
  const review = props.review;
  if (!review) {
    return null;
  }

  const status = review.finalDecision.status;

  return (
    <section className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
      <h3 className="font-semibold">注册前检查</h3>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(status)}`}>{statusLabel(status)}</span>
        <span className="text-slate-700">{buildConclusion(status)}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-6">
        <div className="rounded border border-slate-200 bg-white px-2 py-1">阻断项: {review.finalDecision.blockingReasons.length}</div>
        <div className="rounded border border-slate-200 bg-white px-2 py-1">提示项: {review.finalDecision.warningReasons.length}</div>
        <div className="rounded border border-slate-200 bg-white px-2 py-1">高风险 warning: {review.finalDecision.summary.riskHigh}</div>
        <div className="rounded border border-slate-200 bg-white px-2 py-1">中风险 warning: {review.finalDecision.summary.riskMedium}</div>
        <div className="rounded border border-slate-200 bg-white px-2 py-1">高风险 diff: {review.finalDecision.summary.diffHigh}</div>
        <div className="rounded border border-slate-200 bg-white px-2 py-1">待确认条款: {review.finalDecision.summary.clausePending}</div>
      </div>

      <div className="mt-3">
        <p className="font-medium text-rose-700">Blocking Reasons</p>
        {review.finalDecision.blockingReasons.length === 0 ? (
          <p className="mt-1 text-slate-500">无阻断原因</p>
        ) : (
          <ul className="mt-1 list-disc space-y-1 pl-5 text-rose-700">
            {review.finalDecision.blockingReasons.map((reason, index) => (
              <li key={`${reason}-${index}`}>{reason}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3">
        <p className="font-medium text-amber-800">Warning Reasons</p>
        {review.finalDecision.warningReasons.length === 0 ? (
          <p className="mt-1 text-slate-500">无提示项</p>
        ) : (
          <ul className="mt-1 list-disc space-y-1 pl-5 text-amber-800">
            {review.finalDecision.warningReasons.map((reason, index) => (
              <li key={`${reason}-${index}`}>{reason}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
