# Multi-Tenant（多租户隔离）

## 目标

在现有多项目能力上增加组织级隔离能力，支持 SaaS / 企业部署：
- 不同 tenant 的运行数据互不可见
- tenant 内仍保留原有执行能力（SPU/Gate/Proof）
- 提供跨 tenant 共享的只读规范目录（shared catalog）

## Tenant 模型

实现位置：`server/services/tenant_platform_registry.ts`

`TenantRecord`：
- `tenantId`
- `projects`: tenant 关联项目列表
- `users`: tenant 用户与角色
- `resourceScope`:
  - `spu: "tenant"`
  - `spec: "tenant"`
  - `proof: "tenant"`
  - `container: "tenant"`
  - `sharedCatalog: "read-only"`

说明：
- tenant 是资源隔离边界
- projects/users 作为组织治理元数据
- resourceScope 明确租户资源访问范围

## 隔离实现

### 1) 平台服务实例隔离

- 每个 tenant 拥有独立 `PlatformService` 实例。
- 通过 `TenantPlatformRegistry + AsyncLocalStorage` 在请求级绑定当前 tenant。
- `service` 采用租户上下文代理（scoped proxy），原有业务代码无需大改。

隔离效果：
- `SPU / Spec`：在 tenant 自身 registry 中维护
- `Container / Node / Mapping / Proof`：仅存在于 tenant 自身 runtime state
- 审批流（ApprovalFlow）按 tenant 独立实例
- 导出下载缓存（specbundle）按 tenant key 作用域隔离

### 2) 请求路由租户绑定

- 服务端从 `x-tenant-id`（或 query `tenantId`）解析 tenant。
- 每个请求进入后首先 `enterTenant(...)`，随后所有 `service.*` 调用自动落在当前 tenant。

默认行为：
- 未传 tenant 时使用 `default`。

## 跨 Tenant 共享（只读 Catalog）

### shared catalog

- 基于启动时 seed 的共享 SPU 列表构建 `SharedCatalogItem`。
- 字段包含：`spuId/title/norm/clause/version/category`。
- 强制标记：`readOnly: true`, `sourceTenantId: "shared"`。

### API

- `GET /api/tenants/shared-catalog`
  - 支持 `query/category/norm` 过滤
  - 仅返回只读共享目录

## 新增 API

1. `GET /api/tenants`
- 返回当前 tenant 与 tenant 列表

2. `POST /api/tenants`
- upsert tenant 基础信息（projects/users）

3. `GET /api/tenants/shared-catalog`
- 返回跨 tenant 共享只读规范目录

4. `GET /api/dashboard`
- 增加 `tenantId` 字段，便于监控面确认当前租户上下文

## 客户端对接

实现位置：`src/platform/api-client.ts`

新增：
- `getPlatformTenantId()` / `setPlatformTenantId()`
- 请求头自动携带 `x-tenant-id`
- `listTenants()` / `saveTenant()` / `listSharedCatalogItems()`

## 验收映射

1. 不同组织数据完全隔离
- 每个 tenant 独立 `PlatformService` 实例 + 请求级 tenant 上下文绑定。
- SPU/Spec/Proof/Container 不跨 tenant 共享。

2. 支持共享规范库
- 提供跨 tenant 的 `shared catalog` 只读接口。
- tenant 可查询统一共享规范目录，但不可直接修改共享内容。
