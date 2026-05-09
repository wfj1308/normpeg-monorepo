import { spuCatalogMap } from "../data/spu-catalog.ts";
import { workItemCatalog } from "../data/workitem-catalog.ts";

import type { NodeStatus, SPUNode, WorkItemAggregateStatus, WorkItemInstance } from "../spu-types.ts";

type WorkItemPanelProps = {
  selectedWorkItemId: string | null;
  workItem: WorkItemInstance | null;
  currentSpuId: string;
  onSelectWorkItem: (workItemId: string | null) => void;
  onSelectSpu: (spuId: string) => void;
  onToggleWorkflow: (enabled: boolean) => void;
};

type DisplayStatus = WorkItemAggregateStatus | NodeStatus | "BLOCKED";

function getDisplayStatus(node: SPUNode): DisplayStatus {
  if (node.blockedByFailure) {
    return "BLOCKED";
  }
  return node.status;
}

function getStatusClass(status: DisplayStatus): string {
  if (status === "PASS") {
    return "workitem-status pass";
  }
  if (status === "FAIL") {
    return "workitem-status fail";
  }
  if (status === "BLOCKED") {
    return "workitem-status blocked";
  }
  if (status === "UNLOCKED" || status === "IN_PROGRESS" || status === "SIGNING") {
    return "workitem-status in-progress";
  }
  return "workitem-status ready";
}

function formatStatus(status: DisplayStatus): string {
  switch (status) {
    case "LOCKED":
      return "已锁定";
    case "BLOCKED":
      return "已阻断";
    case "UNLOCKED":
      return "已解锁";
    case "PASS":
      return "通过";
    case "FAIL":
      return "不通过";
    case "IN_PROGRESS":
      return "进行中";
    case "READY":
      return "就绪";
    case "SIGNING":
      return "签名中";
    default:
      return status;
  }
}

function getMeasuredItemLabel(spuId: string): string {
  return spuCatalogMap[spuId]?.measuredItem ?? spuId;
}

function getDependencyStatusLabel(node: SPUNode): string {
  if (node.status === "PASS") {
    return "通过";
  }
  if (node.status === "FAIL") {
    return "不通过";
  }
  if (node.blockedByFailure) {
    return "已阻断";
  }
  if (node.status === "UNLOCKED") {
    return "已解锁";
  }
  return "已锁定";
}

function getDependencyStatusPrefix(node: SPUNode): string {
  if (node.status === "PASS") {
    return "√";
  }
  if (node.status === "FAIL" || node.blockedByFailure) {
    return "×";
  }
  return "锁";
}

function renderDependencyList(workItem: WorkItemInstance, spuId: string) {
  const step = workItem.workflow.find((item) => item.spuId === spuId);
  if (!step || step.dependsOn.length === 0) {
    return <small>无依赖</small>;
  }

  return (
    <div className="workitem-dependency-list">
      {step.dependsOn.map((dependencySpuId) => {
        const dependencyNode = workItem.nodes[dependencySpuId];
        if (!dependencyNode) {
          return (
            <span key={dependencySpuId} className="workitem-dependency-chip">
              {`锁 ${getMeasuredItemLabel(dependencySpuId)}（未知）`}
            </span>
          );
        }
        return (
          <span key={dependencySpuId} className="workitem-dependency-chip">
            {`${getDependencyStatusPrefix(dependencyNode)} ${getMeasuredItemLabel(dependencySpuId)}（${getDependencyStatusLabel(
              dependencyNode,
            )}）`}
          </span>
        );
      })}
    </div>
  );
}

function getWorkflowChain(workItem: WorkItemInstance): string {
  return workItem.workflow.map((step) => getMeasuredItemLabel(step.spuId)).join(" -> ");
}

export default function WorkItemPanel(props: WorkItemPanelProps) {
  const activeWorkItem = props.workItem;

  return (
    <section className="spu-panel">
      <div className="spu-section-title">
        <h2>工序工作流</h2>
      </div>

      <div className="workitem-selector-grid">
        <button
          type="button"
          className={props.selectedWorkItemId === null ? "selector-card active" : "selector-card"}
          onClick={() => props.onSelectWorkItem(null)}
        >
          <span>执行模式</span>
          <strong>单 SPU</strong>
          <small>保持原有自由执行流程。</small>
        </button>
        {Object.values(workItemCatalog).map((item) => (
          <button
            key={item.workItemId}
            type="button"
            className={props.selectedWorkItemId === item.workItemId ? "selector-card active" : "selector-card"}
            onClick={() => props.onSelectWorkItem(item.workItemId)}
          >
            <span>{item.catalogName}</span>
            <strong>{item.workItemName}</strong>
            <small>{item.spuIds.length} 个工作流节点</small>
          </button>
        ))}
      </div>

      {activeWorkItem ? (
        <>
          <div className="workitem-toolbar">
            <div>
              <strong>{activeWorkItem.workflowEnabled ? "工作流已开启" : "工作流已关闭"}</strong>
              <p>{activeWorkItem.workflowEnabled ? "当前按依赖顺序执行。" : "当前工序已恢复自由执行模式。"}</p>
            </div>
            <button
              type="button"
              className={activeWorkItem.workflowEnabled ? "" : "secondary"}
              onClick={() => props.onToggleWorkflow(!activeWorkItem.workflowEnabled)}
            >
              {activeWorkItem.workflowEnabled ? "关闭工作流" : "开启工作流"}
            </button>
          </div>

          <div className="workitem-summary-grid">
            <article className="spu-kpi">
              <span>工序</span>
              <strong>{activeWorkItem.workItemName}</strong>
            </article>
            <article className="spu-kpi">
              <span>规范</span>
              <strong>{activeWorkItem.norm}</strong>
            </article>
            <article className="spu-kpi">
              <span>总数</span>
              <strong>{activeWorkItem.summary.total}</strong>
            </article>
            <article className="spu-kpi">
              <span>状态</span>
              <strong className={getStatusClass(activeWorkItem.aggregateStatus)}>{formatStatus(activeWorkItem.aggregateStatus)}</strong>
            </article>
            <article className="spu-kpi">
              <span>通过</span>
              <strong>{activeWorkItem.summary.passed}</strong>
            </article>
            <article className="spu-kpi">
              <span>失败</span>
              <strong>{activeWorkItem.summary.failed}</strong>
            </article>
            <article className="spu-kpi">
              <span>阻断</span>
              <strong>{activeWorkItem.summary.blocked}</strong>
              <p>{`${activeWorkItem.summary.blocked} 项被阻断`}</p>
            </article>
            <article className="spu-kpi">
              <span>待执行</span>
              <strong>{activeWorkItem.summary.pending}</strong>
            </article>
          </div>

          <section className="workitem-flow-bar">
            <span>执行链路</span>
            <strong>{getWorkflowChain(activeWorkItem)}</strong>
          </section>

          <div className="workitem-node-grid">
            {activeWorkItem.workflow.map((step) => {
              const node = activeWorkItem.nodes[step.spuId];
              const isActive = props.currentSpuId === step.spuId;
              const displayStatus = getDisplayStatus(node);
              const isDisabled = activeWorkItem.workflowEnabled && (node.status === "LOCKED" || node.blockedByFailure);

              return (
                <article
                  key={step.spuId}
                  className={isActive ? "selector-card active workitem-card" : "selector-card workitem-card"}
                >
                  <span>{spuCatalogMap[step.spuId]?.workItem ?? activeWorkItem.workItemName}</span>
                  <strong>{getMeasuredItemLabel(step.spuId)}</strong>
                  {renderDependencyList(activeWorkItem, step.spuId)}
                  <div className="workitem-card-footer">
                    <span className={getStatusClass(displayStatus)}>{formatStatus(displayStatus)}</span>
                    <button type="button" disabled={isDisabled} onClick={() => props.onSelectSpu(step.spuId)}>
                      {displayStatus === "BLOCKED" ? "已阻断" : isDisabled ? "已锁定" : "打开"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <section className="spu-panel workitem-proof-panel">
            <div className="spu-section-title">
              <h2>工序证明</h2>
            </div>
            <pre>{JSON.stringify(activeWorkItem.proof, null, 2)}</pre>
          </section>
        </>
      ) : null}
    </section>
  );
}
