import type { SpuActivationPolicyResult } from "../platform/api-client.ts";

type SpuActivationPolicyPanelProps = {
  activation: SpuActivationPolicyResult | null;
};

function modeLabel(mode: "manual" | "new_containers_only" | "future_tasks_only"): string {
  if (mode === "manual") {
    return "manual";
  }
  if (mode === "future_tasks_only") {
    return "future_tasks_only";
  }
  return "new_containers_only";
}

function decisionBadgeClass(shouldSwitch: boolean): string {
  if (shouldSwitch) {
    return "border-amber-300 bg-amber-50 text-amber-800";
  }
  return "border-slate-300 bg-slate-50 text-slate-700";
}

export default function SpuActivationPolicyPanel(props: SpuActivationPolicyPanelProps) {
  const activation = props.activation;
  if (!activation) {
    return null;
  }

  return (
    <section className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
      <h3 className="font-semibold">规范启用策略</h3>

      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded border border-slate-200 bg-white px-2 py-1">spuKey: {activation.policy.spuKey}</div>
        <div className="rounded border border-slate-200 bg-white px-2 py-1">activationMode: {modeLabel(activation.activationMode)}</div>
        <div className="rounded border border-slate-200 bg-white px-2 py-1">旧版 SPU: {activation.policy.previousSpuId ?? "(none)"}</div>
        <div className="rounded border border-slate-200 bg-white px-2 py-1">新版 SPU: {activation.policy.activeSpuId}</div>
        <div className="rounded border border-slate-200 bg-white px-2 py-1">当前激活版本: {activation.defaultActiveSpuId}</div>
        <div className="rounded border border-slate-200 bg-white px-2 py-1">生效时间: {activation.policy.effectiveAt}</div>
      </div>

      <div className="mt-3 rounded border border-slate-200 bg-white p-2">
        <p className="font-medium">生效说明</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">
          <li>{activation.affectedScope.newContainers}</li>
          <li>{activation.affectedScope.existingRunning}</li>
          <li>{activation.affectedScope.existingCompleted}</li>
          <li>{activation.affectedScope.existingNotStarted}</li>
        </ul>
      </div>

      <div className="mt-3">
        <p className="font-medium">已有容器建议</p>
        {activation.decisions.length === 0 ? (
          <p className="mt-1 text-slate-500">暂无已绑定该规范族的容器</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {activation.decisions.map((decision, index) => (
              <li key={`${decision.containerId ?? "container"}-${index}`} className="rounded border border-slate-200 bg-white p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{decision.containerId ?? "(new container)"}</span>
                  <span className={`rounded border px-2 py-0.5 text-xs ${decisionBadgeClass(decision.shouldSwitch)}`}>
                    shouldSwitch: {decision.shouldSwitch ? "true" : "false"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  current: {decision.currentSpuId ?? "(none)"} | recommended: {decision.recommendedSpuId}
                </p>
                <p className="mt-1 text-slate-700">{decision.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
