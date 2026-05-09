# 架构蓝图（当前主线）

本文档定义当前 monorepo 的分层边界、职责分配与新增业务接入方式，目标是让后续迭代在结构上保持一致。

## 1. 总体分层

- `apps/web`: 展示层 + 页面编排层（React）
- `services/api`: 接口层 + 业务应用层（FastAPI）
- `packages/*`: 共享类型与通用能力（types/sdk/proof/db）
- `infra/*`: 基础设施（Supabase SQL、Docker）

原则：

1. 页面组件不直接拼接复杂业务流程，流程进入 `app/*Flow` 或 `app/*Controller`。
2. router 只做参数/鉴权/返回包装，业务逻辑进入 `*_service.py`。
3. 共享模型进入 `packages/types`，避免跨应用重复定义。

## 2. 前端结构约定（apps/web）

### 2.1 目录角色

- `src/components/*`: 可复用 UI/业务组件（尽量无重副作用）
- `src/pages/*`: 页面级容器
- `src/app/*`: 页面编排相关的 flow/controller/hook（有状态、有副作用）
- `src/hooks/useApi.ts`: API 调用基座（逐步向 domain API client 拆分）
- `src/store/*`: 全局状态（auth/project/ui 等）

### 2.2 当前已落地的编排层

- `authFlows.ts`
- `demoLoginFlows.ts`
- `permissionFlows.ts`
- `teamMemberFlows.ts`
- `projectActionFlows.ts`
- `registerSubmitFlow.ts`
- `registerErpBindingFlow.ts`
- `useProjectDetailController.ts`
- `useRegisterController.ts`
- `useSettingsController.ts`
- `useGitpegCallbackSync.ts`
- `useProjectMetaSync.ts`

### 2.3 新业务接入模板

1. 在 `components/` 新建纯展示组件。
2. 在 `app/` 新建 `xxxFlow.ts` 或 `useXxxController.ts`。
3. `App.tsx` / page 只保留编排调用，不内嵌长业务分支。
4. 需要复用的数据结构优先放到 `packages/types`。

## 3. 后端结构约定（services/api）

### 3.1 目录角色

- `routers/*.py`: HTTP 接口定义 + 依赖注入
- `*_service.py`: 业务流程与规则
- `*_schemas.py`: 请求/响应模型
- `dependencies.py`: 统一依赖提供（如 Supabase client）

### 3.2 安全基线

- 危险或调试接口默认关闭，启用必须显式环境变量
- token 吊销必须可跨 worker 一致（持久化 + 兼容迁移）
- 公开路由与鉴权路由必须明确区分

## 4. 工程护栏

### 4.1 已执行

- `packages/db|proof|sdk|types` 已从 `skip` 脚本切换为真实 `tsc` 校验。
- `apps/web` 的 `test` 也切到可执行校验（当前为 typecheck）。

### 4.2 下一步

1. 引入真实行为测试（前端 smoke + 后端关键流程）。
2. 在 CI 中强制 `npm run lint/build/test` 作为合并门禁。
3. 针对高变模块补最小回归样例（register/project/team）。

## 5. 当前主要风险（需持续治理）

- `apps/web/src/hooks/useApi.ts` 仍偏大（建议按 domain 拆 API client）
- 若干后端 service 文件仍较长（建议继续拆 repository/adapter）
- 测试目前以 typecheck 为主，业务回归覆盖不足

## 6. 变更准入清单

新增功能前必须确认：

1. 新逻辑放在正确层级（component vs flow/controller vs service）
2. 不新增跨层耦合（UI 直接调底层、router 写重业务）
3. 能通过全仓 `lint/build/test`
4. 文档中补充新增模块入口与职责
