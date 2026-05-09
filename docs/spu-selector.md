# SPU Selector（最小实现）

更新时间：2026-04-23

目标：在不破坏“受控入口”前提下，为 NL2Gate 和执行区提供可解释的 SPU 候选选择能力，减少手工找规范。

## 1. 输入结构

`SPUSelectorInput`（服务端：`apps/executable-spec-web/server/services/spu_selector_service.ts`）：

- `intent`: 当前意图（如 `gate.preview` / `gate.evaluate`）
- `projectContext`:
  - `projectId`
  - `preferredCategory`
  - `preferredClause`
- `containerMetadata`:
  - `containerId`
  - `projectId`
  - `boundSpuIds`
  - `currentSpuId`
  - `nodeType`
- `nodeMetadata`:
  - `nodeId`
  - `spuId`
  - `nodeType`
- `hints`（可选）:
  - `spuId` / `spuKey`
  - `category` / `clause` / `measuredItem`
- `inputs`（可选）：当前已收集输入，用于计算候选的缺失参数
- `limit`（可选）：候选数量上限

## 2. 输出结构

`SpuSelectorResult`：

- `selectedSpuId`: 当前排序第一名候选
- `rankedCandidates[]`:
  - `rank`
  - `spuId`
  - `spuKey`
  - `score`
  - `matchReasons`（可解释匹配原因）
  - `requiredMissingInputs`（该候选仍缺失的必填输入）

示例：

```json
{
  "intent": "gate.evaluate",
  "selectedSpuId": "highway.subgrade.compaction.4.2.1.soil@v1",
  "rankedCandidates": [
    {
      "rank": 1,
      "spuId": "highway.subgrade.compaction.4.2.1.soil@v1",
      "spuKey": "highway.subgrade.compaction.4.2.1.soil",
      "score": 2000,
      "matchReasons": ["project-bound active (project-alpha)", "exact category (路基)", "exact clause (4.2.1)"],
      "requiredMissingInputs": ["maxDryDensity"]
    }
  ]
}
```

## 3. 最小排序逻辑（已落地）

核心优先级：

1. `project-bound` 优先（项目绑定激活版本优先）
2. `exact category` 优先
3. `exact clause` 优先

并辅以少量 tie-break 信息（如显式 `spuId/spuKey`、节点/容器当前 SPU、容器已绑定等），最终按分数降序输出。

## 4. 接口与接线

### 4.1 独立选择接口

- `POST /api/spu-selector/select`
- 位置：`apps/executable-spec-web/server/platform-api.ts`
- 前端调用：`apps/executable-spec-web/src/platform/api-client.ts` 的 `selectSpuCandidates(...)`

### 4.2 NL2Gate 接入

位置：`apps/executable-spec-web/server/services/nl2gate_bridge_service.ts`

- 查询解析后先调用 `selectSpuCandidates(...)`
- 写入 `structured.spuCandidates`
- SPU 解析顺序：
  1. 显式 `spuId`
  2. selector `selectedSpuId`
  3. 原有 metric fallback

这样 NL2Gate 不再要求用户每次手工指定 SPU，同时仍保留可解释候选和受控执行链路。

### 4.3 执行区“规范选择”接入

位置：`apps/executable-spec-web/src/SPUApp.tsx`

- 新增 selector 状态 `spuSelectorResult`
- 执行区自动刷新候选（项目/容器/节点上下文变化时）
- UI 增加“采用系统推荐规范”按钮
- 展示 top 候选的 `reasons` 与 `missingInputs`

## 5. 验收映射

1. 用户不必每次手工找 SPU：  
执行区可自动给出推荐；NL2Gate 也可根据上下文自动选候选。

2. 候选可解释：  
每个候选都返回 `matchReasons` + `requiredMissingInputs`。

3. 最终执行可追溯：  
NL2Gate 结果仍通过 Gate 执行返回 `structured.command` 与 `structured.execution`（含 `executionId`），SPU Selector 只负责候选选择，不绕过 Gate。

## 6. 相关测试

- `apps/executable-spec-web/server/services/spu_selector_service.test.ts`
  - project-bound 优先
  - exact category 优先
  - exact clause 优先
  - required missing inputs 输出
- `apps/executable-spec-web/server/services/nl2gate_bridge_service.test.ts`
  - NL2Gate 返回 `spuCandidates`
  - project-bound 候选优先被选中
