import type { SpecImpactAnalysis } from "../platform/api-client.ts";

type SpecImpactAnalysisPanelProps = {
  analysis: SpecImpactAnalysis | null;
  baseSpuId?: string | null;
};

function impactLevelClass(level: "high" | "medium" | "low"): string {
  if (level === "high") {
    return "border-rose-300 bg-rose-50 text-rose-700";
  }
  if (level === "medium") {
    return "border-amber-300 bg-amber-50 text-amber-800";
  }
  return "border-emerald-300 bg-emerald-50 text-emerald-800";
}

function compactValue(value: unknown): string {
  if (typeof value === "undefined") {
    return "(empty)";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return value || "(empty)";
  }
  try {
    const text = JSON.stringify(value);
    if (!text) {
      return "(empty)";
    }
    return text.length > 140 ? `${text.slice(0, 140)}...` : text;
  } catch {
    return String(value);
  }
}

export default function SpecImpactAnalysisPanel(props: SpecImpactAnalysisPanelProps) {
  const analysis = props.analysis;
  if (!analysis) {
    return null;
  }

  return (
    <section className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
      <h3 className="font-semibold">规范升级影响分析</h3>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${impactLevelClass(analysis.impactLevel)}`}>
          impactLevel: {analysis.impactLevel}
        </span>
        {props.baseSpuId ? <span className="text-xs text-slate-600">baseline: {props.baseSpuId}</span> : null}
      </div>

      <p className="mt-2 text-slate-700">{analysis.summary}</p>

      <p className="mt-2 text-xs text-slate-600">
        affectedAreas: {analysis.affectedAreas.length > 0 ? analysis.affectedAreas.join(", ") : "(none)"}
      </p>

      <div className="mt-3">
        <p className="font-medium">差异列表</p>
        {analysis.diffs.length === 0 ? (
          <p className="mt-1 text-emerald-700">未检测到关键差异</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {analysis.diffs.map((item, index) => (
              <li key={`${item.field}-${index}`} className="rounded border border-slate-200 bg-white p-2">
                <p className="font-mono text-xs text-slate-700">{item.field}</p>
                <p className="mt-1 text-xs text-slate-600">old: {compactValue(item.oldValue)}</p>
                <p className="mt-1 text-xs text-slate-600">new: {compactValue(item.newValue)}</p>
                <p className="mt-1 text-xs text-slate-600">
                  impactType: {item.impactType} | impactLevel: {item.impactLevel} | changeType: {item.changeType}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
