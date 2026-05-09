import type { ReactNode } from "react";

import { spuCatalogMap } from "../data/spu-catalog.ts";
import { formatStatusText } from "../space-context-contract.ts";
import type { SpaceContainer, SpaceSlot, SPU, SPUNode } from "../spu-types.ts";

type SpuContextPanelProps = {
  spu: SPU;
  node?: SPUNode | null;
  spaceContainer?: SpaceContainer | null;
  spaceSlot?: SpaceSlot | null;
  loadingSpaceContext?: boolean;
  spaceContextError?: string;
};

function formatStateLabel(status: string | null | undefined): string {
  return formatStatusText(status);
}

function PreviewCard(props: { title: string; children: ReactNode }) {
  return (
    <article className="spu-preview-card">
      <h4>{props.title}</h4>
      <div className="spu-preview-body">{props.children}</div>
    </article>
  );
}

export default function SpuContextPanel(props: SpuContextPanelProps) {
  const mapping = spuCatalogMap[props.spu.spuId];
  const category = mapping?.category ?? "[待补充]";
  const workItem = mapping?.workItem ?? "[待补充]";
  const measuredItem = mapping?.measuredItem ?? "[待补充]";
  const pathLabel = mapping?.pathLabel ?? "[待补充]";
  const normName = mapping?.normName ?? props.spu.meta.norm;
  const clause = mapping?.clause ?? props.spu.meta.clause;
  const currentForm = props.spu.forms[0];
  const ruleSummary =
    props.spu.rules.length > 0
      ? props.spu.rules.map((rule) => rule.message || `${rule.field} ${rule.operator} ${rule.value}`).join("; ")
      : "-";

  const activeContainer = props.spaceContainer ?? null;
  const activeSlot = props.spaceSlot ?? activeContainer?.geo_slot ?? null;
  const stationText = activeSlot?.geo.station ?? "-";
  const coordsText = activeSlot ? `${activeSlot.geo.coords.x}, ${activeSlot.geo.coords.y}` : "-";
  const elevationText = activeSlot ? String(activeSlot.geo.elevation) : "-";
  const containerState = formatStateLabel(activeContainer?.norm_execution.current_state);
  const lifecycleState = formatStateLabel(activeContainer?.lifecycle_state);
  const specBindings = activeContainer?.spec_bindings ?? [];
  const boundSpecs =
    specBindings.length > 0 ? specBindings.map((item) => `${item.spuId} (${formatStateLabel(item.status)})`).join(", ") : "-";
  const inspector = activeContainer?.trip_binding.inspector || "-";
  const supervisor = activeContainer?.trip_binding.supervisor || "-";
  const containerRef = props.node?.container_ref ?? activeContainer?.v_address ?? "-";
  const nodeHistory = activeContainer?.node_history ?? [];
  const latestPassNode = activeContainer?.latest_pass_node ?? null;
  const latestPassText = latestPassNode ? `#${latestPassNode.attempt_index} (${formatStateLabel(latestPassNode.status)})` : "-";

  return (
    <>
      <section className="spu-context-layer">
        <div className="spu-context-heading">
          <div>
            <p className="spu-eyebrow">规范上下文</p>
            <h2>规范执行上下文层</h2>
            <p>在同一视图中展示规范语义与空间执行上下文。</p>
          </div>
        </div>

        <div className="spu-context-grid">
          <article className="spu-context-card spu-space-context-card">
            <span>空间上下文</span>
            <h3>空间上下文</h3>
            <dl className="spu-context-list">
              <div>
                <dt>当前桩号</dt>
                <dd>{stationText}</dd>
              </div>
              <div>
                <dt>坐标</dt>
                <dd>{coordsText}</dd>
              </div>
              <div>
                <dt>高程</dt>
                <dd>{elevationText}</dd>
              </div>
              <div>
                <dt>容器状态</dt>
                <dd>{containerState}</dd>
              </div>
              <div>
                <dt>生命周期</dt>
                <dd>{lifecycleState}</dd>
              </div>
              <div>
                <dt>绑定规范</dt>
                <dd>{boundSpecs}</dd>
              </div>
              <div>
                <dt>绑定人员</dt>
                <dd>{`${inspector} / ${supervisor}`}</dd>
              </div>
              <div>
                <dt>容器引用</dt>
                <dd>{containerRef}</dd>
              </div>
              <div>
                <dt>当前结果</dt>
                <dd>{latestPassText}</dd>
              </div>
            </dl>
            <div className="spu-history-list">
              {nodeHistory.length > 0 ? (
                nodeHistory.map((item) => (
                  <p key={item.node_id}>
                    {`第${item.attempt_index}次：${item.spu_id} ${formatStateLabel(item.status)}（${item.created_at}）`}
                  </p>
                ))
              ) : (
                <p>暂无执行历史。</p>
              )}
            </div>
            {props.loadingSpaceContext ? <p className="spu-space-hint">正在加载空间上下文...</p> : null}
            {props.spaceContextError ? <p className="spu-space-hint error">{props.spaceContextError}</p> : null}
          </article>

          <article className="spu-context-card">
            <span>规范信息</span>
            <h3>规范与条款</h3>
            <dl className="spu-context-list">
              <div>
                <dt>规范</dt>
                <dd>{normName}</dd>
              </div>
              <div>
                <dt>条款</dt>
                <dd>{clause}</dd>
              </div>
              <div>
                <dt>版本</dt>
                <dd>{props.spu.meta.version}</dd>
              </div>
              <div>
                <dt>SPU 名称</dt>
                <dd>{props.spu.meta.name}</dd>
              </div>
              <div>
                <dt>spuId</dt>
                <dd>{props.spu.spuId}</dd>
              </div>
            </dl>
          </article>

          <article className="spu-context-card">
            <span>目录位置</span>
            <h3>目录映射</h3>
            <dl className="spu-context-list">
              <div>
                <dt>专业类别</dt>
                <dd>{category}</dd>
              </div>
              <div>
                <dt>工序项</dt>
                <dd>{workItem}</dd>
              </div>
              <div>
                <dt>检测项</dt>
                <dd>{measuredItem}</dd>
              </div>
              <div>
                <dt>完整路径</dt>
                <dd>{pathLabel}</dd>
              </div>
            </dl>
          </article>

          <article className="spu-context-card">
            <span>执行摘要</span>
            <h3>当前 SPU 摘要</h3>
            <dl className="spu-context-list">
              <div>
                <dt>表单数量</dt>
                <dd>{props.spu.forms.length}</dd>
              </div>
              <div>
                <dt>当前表单</dt>
                <dd>{currentForm?.formCode ?? "-"}</dd>
              </div>
              <div>
                <dt>角色</dt>
                <dd>{currentForm?.role ?? "-"}</dd>
              </div>
              <div>
                <dt>输出字段</dt>
                <dd>{props.spu.data.outputs.map((item) => item.name).join(", ")}</dd>
              </div>
              <div>
                <dt>规则数量</dt>
                <dd>{props.spu.rules.length}</dd>
              </div>
              <div>
                <dt>规则摘要</dt>
                <dd>{ruleSummary}</dd>
              </div>
            </dl>
          </article>
        </div>
      </section>

      <section className="spu-panel">
        <div className="spu-section-title">
          <h2>SPU 结构预览</h2>
        </div>
        <div className="spu-preview-grid">
          <PreviewCard title="表单（forms）">
            {props.spu.forms.map((form) => (
              <div key={form.formCode} className="spu-preview-row">
                <strong>{form.formCode}</strong>
                <span>{form.role}</span>
                <span>{form.required ? "必填" : "选填"}</span>
              </div>
            ))}
          </PreviewCard>

          <PreviewCard title="输入字段（data.inputs）">
            {props.spu.data.inputs.map((input) => (
              <div key={input.name} className="spu-preview-row">
                <strong>{input.label}</strong>
                <span>{input.name}</span>
                <span>{input.type}</span>
              </div>
            ))}
          </PreviewCard>

          <PreviewCard title="输出字段（data.outputs）">
            {props.spu.data.outputs.map((output) => (
              <div key={output.name} className="spu-preview-row">
                <strong>{output.name}</strong>
              </div>
            ))}
          </PreviewCard>

          <PreviewCard title="路径（path）">
            {props.spu.path.map((step) => (
              <div key={step.step} className="spu-preview-row">
                <strong>{step.step}</strong>
                <span>{step.formula}</span>
              </div>
            ))}
          </PreviewCard>

          <PreviewCard title="规则（rules）">
            {props.spu.rules.map((rule) => (
              <div key={rule.ruleId} className="spu-preview-row">
                <strong>{rule.ruleId}</strong>
                <span>
                  {rule.field} {rule.operator} {rule.value}
                </span>
                <span>{rule.message}</span>
              </div>
            ))}
          </PreviewCard>

          <PreviewCard title="必需签名（proof.requiredSignatures）">
            {props.spu.proof.requiredSignatures.map((signature) => (
              <div key={signature} className="spu-preview-row">
                <strong>{signature}</strong>
              </div>
            ))}
          </PreviewCard>
        </div>
      </section>
    </>
  );
}
