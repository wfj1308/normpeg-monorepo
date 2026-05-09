# Publishing Workflow (Lightweight Enterprise)

## Goal

将原有最小审批流升级为轻量企业发布流，支持规范资产与模板资产的正式治理，同时保持实现简洁、可追溯、可扩展。

## Workflow Status

审批对象状态扩展为：

- `draft`
- `submitted`
- `in_review`
- `approved`
- `rejected`
- `published`
- `deprecated`

主链路：

`draft -> submitted -> in_review -> approved -> published -> deprecated`

补充链路：

`in_review -> rejected -> submitted`（修订后重新提交）

## Asset Type Segmentation

审批对象支持三类资产：

- `spu`
- `template`
- `specbundle`

实现位置：

- `server/services/approval_flow_service.ts`

核心字段：

- `assetType`: `spu | template | specbundle`
- `assetRef`: 资产引用（可选）
- `status`: 发布流状态
- `events`: 完整状态迁移事件列表（审计轨迹）

## Traceable Audit Record

每次状态迁移都会写入不可丢失的事件记录：

- `eventId`
- `action` (`create_draft | submit | start_review | approve | reject | publish | deprecate`)
- `actorId`
- `note`
- `fromStatus`
- `toStatus`
- `at` (ISO timestamp)

这保证审批记录可审计、可回放、可追责。

## API Surface

路由实现：

- `apps/executable-spec-web/server/platform-api.ts`

### Create / Query

- `POST /api/approval/candidates`
  - 支持 `assetType`、`assetRef`
  - 创建后状态为 `draft`
- `GET /api/approval/candidates`
  - 支持过滤：`assetType`、`status`
- `GET /api/approval/candidates/:id`

### State Transition

- `POST /api/approval/candidates/:id/submit`
- `POST /api/approval/candidates/:id/review`
- `POST /api/approval/candidates/:id/decision` (`approve | reject`)
- `POST /api/approval/candidates/:id/publish`
- `POST /api/approval/candidates/:id/deprecate`

## Publish Behavior

- `spu` 资产支持在发布时附带 `definition` 并触发 SPU 发布。
- `template/specbundle` 资产走同一审批状态机，但不触发 SPU definition 发布逻辑。
- 发布成功后可写入 `publishedRef` 作为外部追踪标识。

## Client Contract

前端 API 类型与方法已同步：

- `apps/executable-spec-web/src/platform/api-client.ts`

新增/更新：

- `CandidateApprovalAssetType`
- 新状态枚举与事件 action 枚举
- `submitApprovalCandidate(...)`
- `deprecateApprovalCandidate(...)`
- `listApprovalCandidates({ assetType, status })`

## Acceptance Mapping

- 资产发布不再只是单按钮动作：需要经过 `draft -> submitted -> in_review -> approved -> published`。
- 有正式状态与审计记录：每次迁移均落事件，具备完整追溯链路。
- 支持分资产治理：`SPU`、`Template`、`SpecBundle` 使用同一治理骨架，差异化发布行为。
