import type { RiskReviewResult } from "../platform/api-client.ts";

type WarningRiskReviewPanelProps = {
  review: RiskReviewResult | null;
};

function badgeClass(level: "high" | "medium" | "low"): string {
  if (level === "high") {
    return "bg-rose-100 text-rose-700 border-rose-200";
  }
  if (level === "medium") {
    return "bg-amber-100 text-amber-700 border-amber-200";
  }
  return "bg-emerald-100 text-emerald-700 border-emerald-200";
}

function statusClass(review: RiskReviewResult): string {
  if (!review.canRegister) {
    return "border-rose-300 bg-rose-50 text-rose-700";
  }
  if (review.summary.confirmRequired > 0) {
    return "border-amber-300 bg-amber-50 text-amber-800";
  }
  return "border-emerald-300 bg-emerald-50 text-emerald-800";
}

export default function WarningRiskReviewPanel(props: WarningRiskReviewPanelProps) {
  const review = props.review;
  if (!review) {
    return null;
  }

  return (
    <section className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
      <h3 className="font-semibold">风险审阅（Warning Risk Review）</h3>

      <p className={`mt-2 rounded border px-3 py-2 ${statusClass(review)}`}>{review.reviewMessage}</p>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
        <div className="rounded border border-slate-200 bg-white px-2 py-1">高风险: {review.summary.high}</div>
        <div className="rounded border border-slate-200 bg-white px-2 py-1">中风险: {review.summary.medium}</div>
        <div className="rounded border border-slate-200 bg-white px-2 py-1">低风险: {review.summary.low}</div>
        <div className="rounded border border-slate-200 bg-white px-2 py-1">阻断注册: {review.summary.blocking}</div>
        <div className="rounded border border-slate-200 bg-white px-2 py-1">需确认: {review.summary.confirmRequired}</div>
      </div>

      <div className="mt-3">
        <p className="font-medium">风险项列表</p>
        {review.items.length === 0 ? (
          <p className="mt-1 text-emerald-700">无风险项</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {review.items.map((item) => (
              <li key={item.id} className="rounded border border-slate-200 bg-white p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded border px-2 py-0.5 text-xs ${badgeClass(item.riskLevel)}`}>{item.riskLevel}</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{item.category}</span>
                  <span className="text-xs text-slate-500">{item.code}</span>
                </div>
                <p className="mt-1 font-medium">{item.title}</p>
                <p className="mt-1 text-slate-700">{item.message}</p>
                <p className="mt-1 text-xs text-slate-500">
                  阻断注册: {item.blocksRegister ? "是" : "否"} | 需人工确认: {item.requiresConfirmation ? "是" : "否"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
