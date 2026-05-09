import type { RunningImpactScan } from "../platform/api-client.ts";

type RunningImpactScanPanelProps = {
  scan: RunningImpactScan | null;
};

function badgeClass(level: "high" | "medium" | "low"): string {
  if (level === "high") {
    return "border-rose-300 bg-rose-50 text-rose-700";
  }
  if (level === "medium") {
    return "border-amber-300 bg-amber-50 text-amber-800";
  }
  return "border-emerald-300 bg-emerald-50 text-emerald-800";
}

function topMessageClass(scan: RunningImpactScan): string {
  const hasRunningHigh = scan.affectedContainers.some((item) => item.containerState === "running" && item.impactLevel === "high");
  if (hasRunningHigh) {
    return "border-rose-300 bg-rose-50 text-rose-700";
  }
  if (scan.summary.totalAffected > 0) {
    return "border-amber-300 bg-amber-50 text-amber-800";
  }
  return "border-emerald-300 bg-emerald-50 text-emerald-800";
}

function topMessage(scan: RunningImpactScan): string {
  const hasRunningHigh = scan.affectedContainers.some((item) => item.containerState === "running" && item.impactLevel === "high");
  if (hasRunningHigh) {
    return "当前存在运行中的旧版执行实例，请人工评估后再启用新版本。";
  }
  if (scan.summary.totalAffected > 0) {
    return "检测到旧版关联容器，建议逐项复核差异影响。";
  }
  return "未检测到受影响容器。";
}

export default function RunningImpactScanPanel(props: RunningImpactScanPanelProps) {
  const scan = props.scan;
  if (!scan) {
    return null;
  }

  return (
    <section className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
      <h3 className="font-semibold">运行中容器影响扫描</h3>

      <p className={`mt-2 rounded border px-3 py-2 ${topMessageClass(scan)}`}>{topMessage(scan)}</p>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded border border-slate-200 bg-white px-2 py-1">受影响总数: {scan.summary.totalAffected}</div>
        <div className="rounded border border-slate-200 bg-white px-2 py-1">运行中: {scan.summary.running}</div>
        <div className="rounded border border-slate-200 bg-white px-2 py-1">已完成: {scan.summary.completed}</div>
        <div className="rounded border border-slate-200 bg-white px-2 py-1">需复核: {scan.summary.requiresReview}</div>
      </div>

      <div className="mt-3">
        <p className="font-medium">受影响容器列表</p>
        {scan.affectedContainers.length === 0 ? (
          <p className="mt-1 text-emerald-700">无受影响容器</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {scan.affectedContainers.map((item) => (
              <li key={`${item.containerId}-${item.spuId}`} className="rounded border border-slate-200 bg-white p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{item.containerId}</span>
                  <span className={`rounded border px-2 py-0.5 text-xs ${badgeClass(item.impactLevel)}`}>{item.impactLevel}</span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  lifecycleState: {item.lifecycleState} | specStatus: {item.specStatus} | containerState: {item.containerState}
                </p>
                <p className="mt-1 text-slate-700">{item.message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
