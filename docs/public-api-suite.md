# Public API Suite (Stable Integration Surface)

## Goal

在不新增内部业务能力的前提下，基于现有 `pdf / spu / gate / state / proof / mapping / form / report` 能力，提供一套第三方可集成的稳定 API 面，并明确：

- `internal only`
- `beta`
- `stable public`

## Classification Policy

### Stable Public

仅以下 `public v1` 套件对外承诺稳定（向后兼容优先）：

- `POST /api/public/v1/specs/register-markdown`
- `POST /api/public/v1/spus/publish`
- `POST /api/public/v1/executions/evaluate`
- `GET /api/public/v1/proofs/:containerId`
- `GET /api/public/v1/mappings/by-stake?stake=...`
- `GET /api/public/v1/mappings/by-container/:containerId` (兼容 `/container/:containerId`)
- `GET /api/public/v1/mappings/by-node/:nodeId` (兼容 `/node/:nodeId`)
- `POST /api/public/v1/proofs/export`

### Beta

以下仍可用于灰度联调，但不保证稳定契约：

- `/api/gate/*`（preview/evaluate/batch-evaluate）
- `/api/nl2gate/query`
- `/api/spu-selector/select`
- `/api/spec/pdf-to-draft`
- `/api/spec/register-template`
- `/api/external-inputs/*`
- `/api/catalog-assets*`
- `/api/approval/candidates*`
- `/api/versioning/*`
- `/api/runtime/*`
- `/api/scheduler/*`

### Internal Only

以下为内部调试、运维或底层观测接口，不对第三方开放：

- `/api/dashboard`
- `/api/layerpeg/*`
- `/api/containers/:id/audit`
- `/api/audit/:entityType/:entityId`
- `/downloads/*`
- `/api/anchors/*`
- 以及未出现在 `stable public` 的其他内部路由

## Unified Envelope (Stable Public)

`stable public` 返回统一 envelope。

Success:

```json
{
  "ok": true,
  "data": {},
  "error": null,
  "meta": {
    "requestId": "pub_...",
    "version": "public.v1",
    "timestamp": "2026-04-24T10:00:00.000Z"
  }
}
```

Error:

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "PUBLIC_INVALID_ARGUMENT",
    "message": "markdown is required"
  },
  "meta": {
    "requestId": "pub_...",
    "version": "public.v1",
    "timestamp": "2026-04-24T10:00:00.000Z"
  }
}
```

## Unified Error Codes (Stable Public)

- `PUBLIC_INVALID_ARGUMENT`
- `PUBLIC_UNAUTHORIZED`
- `PUBLIC_FORBIDDEN`
- `PUBLIC_NOT_FOUND`
- `PUBLIC_CONFLICT`
- `PUBLIC_GATE_REQUEST_INVALID`
- `PUBLIC_GATE_DEPENDENCY_UNMET`
- `PUBLIC_GATE_EXECUTION_FAILED`
- `PUBLIC_INTERNAL_ERROR`

## Minimal Stable API Suite

### 1) Register Spec/SPU

#### `POST /api/public/v1/specs/register-markdown`

用途：注册 markdown 规范为可执行 SPU（复用现有 register pipeline）。

请求（最小）：

```json
{
  "markdown": "# Spec ..."
}
```

#### `POST /api/public/v1/spus/publish`

用途：发布已结构化的 SPU 定义。

请求（最小）：

```json
{
  "definition": {
    "spuId": "demo.spu@v1",
    "meta": { "name": "Demo", "norm": "DEMO", "clause": "1.0", "version": "v1" },
    "data": { "inputs": [], "outputs": [] },
    "path": [],
    "rules": [],
    "proof": { "resultField": "result", "requiredSignatures": [] }
  }
}
```

### 2) Execute

#### `POST /api/public/v1/executions/evaluate`

用途：执行 gate evaluate（可选 external input 映射），返回执行结果与 proof fragment。

请求（示例）：

```json
{
  "spuId": "demo.spu@v1",
  "containerId": "container_001",
  "inputs": { "value": 95 }
}
```

### 3) Query Proof

#### `GET /api/public/v1/proofs/:containerId`

用途：查询容器归档 proof（含标准输出引用字段）。

### 4) Query Mapping

#### `GET /api/public/v1/mappings/by-stake?stake=K19+070`

用途：按桩号查询当前容器、活跃规范、proof 摘要、状态汇总。

可选：

- `GET /api/public/v1/mappings/by-container/:containerId`
- `GET /api/public/v1/mappings/by-node/:nodeId`

### 5) Export Proof

#### `POST /api/public/v1/proofs/export`

用途：导出审计包（JSON export / Markdown summary / PDF-ready payload）。

请求：

```json
{
  "containerId": "container_001"
}
```

或

```json
{
  "nodeId": "node_001"
}
```

## Compatibility Notes

- 旧 `/api/*` 路由继续保留（供内部与 beta 使用），但不纳入稳定对外契约。
- 第三方系统应优先接入 `stable public` 路由，不依赖内部调试字段与未分级端点。
