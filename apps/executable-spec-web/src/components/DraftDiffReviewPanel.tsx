import type { DraftDiffReviewResult } from "../spec-compiler/review/draft_diff_review.ts";

type DraftDiffReviewPanelProps = {
  review: DraftDiffReviewResult | null;
};

function diffLineClass(type: "added" | "removed" | "modified"): string {
  if (type === "added") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (type === "removed") {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function formatLine(diff: DraftDiffReviewResult["lineDiffs"][number]): string {
  if (diff.type === "added") {
    return `+ ${diff.newLine ?? ""}`;
  }
  if (diff.type === "removed") {
    return `- ${diff.oldLine ?? ""}`;
  }
  return `~ ${diff.oldLine ?? ""} -> ${diff.newLine ?? ""}`;
}

export default function DraftDiffReviewPanel(props: DraftDiffReviewPanelProps) {
  const review = props.review;
  if (!review) {
    return null;
  }

  const highRisk = review.sectionChanges.filter((item) => item.riskLevel === "high");
  const previewLineDiffs = review.lineDiffs.slice(0, 40);

  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
      <p className="font-semibold">草稿变更审阅</p>

      {!review.hasChanges ? (
        <p className="mt-2 text-emerald-700">未检测到草稿变更</p>
      ) : (
        <>
          <p className="mt-2">
            变更摘要：新增 <strong>{review.summary.added}</strong> 处，删除 <strong>{review.summary.removed}</strong> 处，修改 <strong>{review.summary.modified}</strong> 处
          </p>

          <div className="mt-3">
            <p className="font-medium">高风险变更</p>
            {highRisk.length === 0 ? (
              <p className="mt-1 text-emerald-700">无高风险变更</p>
            ) : (
              <ul className="mt-1 list-disc space-y-1 pl-5 text-rose-700">
                {highRisk.map((item, index) => (
                  <li key={`${item.section}-${index}`}>[{item.section}] {item.message}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-3">
            <p className="font-medium">行级 Diff 预览</p>
            {previewLineDiffs.length === 0 ? (
              <p className="mt-1 text-slate-500">无行级差异</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {previewLineDiffs.map((item, index) => (
                  <li key={`${item.type}-${index}`} className={`rounded border px-2 py-1 font-mono text-xs ${diffLineClass(item.type)}`}>
                    {formatLine(item)}
                  </li>
                ))}
              </ul>
            )}
            {review.lineDiffs.length > previewLineDiffs.length ? (
              <p className="mt-2 text-xs text-slate-500">仅展示前 {previewLineDiffs.length} 条差异</p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
