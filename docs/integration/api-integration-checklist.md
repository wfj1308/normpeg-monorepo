# QCSpec DocPeg 联调验收清单（以同事 API 文档为准）

更新时间：2026-04-13

## 1. 单一事实来源

- API 文档唯一来源：`docs/qcspec-full-api-pack.md`
- Base URL：`https://api.docpeg.cn`
- 前端目标：保留现有页面结构，只替换为同事新 API；未提供后端接口的页面允许显示空数据。

---

## 2. P0 接口覆盖（代码层）

结论：`20 / 20` 已在前端 Hook 层接入（`useQCSpecDocPegApi` 与 `workbenchApi`）。

已覆盖 P0：

- `POST /projects`
- `GET /projects`
- `GET /projects/{projectId}`
- `POST /api/v1/execpeg/execute`
- `GET /api/v1/execpeg/status/{execId}`
- `GET /api/v1/execpeg/status/{execId}/callbacks`
- `POST /api/v1/dtorole/role-bindings`
- `GET /api/v1/dtorole/permission-check`
- `GET /projects/{projectId}/entities`
- `GET /projects/{projectId}/process-chains`
- `GET /projects/{projectId}/process-chains/{chainId}/status`
- `GET /api/v1/normref/projects/{projectId}/forms/{formCode}`
- `POST /api/v1/normref/projects/{projectId}/forms/{formCode}/interpret-preview`
- `POST /api/v1/normref/projects/{projectId}/forms/{formCode}/draft-instances`
- `POST /api/v1/triprole/submit`
- `GET /api/v1/proof/{proofId}`
- `POST /api/v1/proof/{proofId}/verify`
- `POST /api/v1/boqitem/projects/{projectId}/consume`
- `POST /api/v1/boqitem/projects/{projectId}/settle`
- `POST /api/v1/files/upload`

---

## 3. 页面级联调状态（按实际触发）

### 3.1 已接入并有页面触发

- 项目页（Projects）
  - 项目列表/详情/创建：`/projects*`
  - 构件树：`/projects/{id}/entities`
  - 工序链工作台：`/projects/{id}/process-chains*`
  - 表单链路：`/api/v1/normref/*`、`/api/v1/triprole/*`、`/api/v1/proof/{id}`
- 开始质检页（Inspection）
  - 工序推进：`/projects/{id}/process-chains*`、`/api/v1/triprole/*`
  - 执行体联调：`/api/v1/execpeg/*`
  - DTO 判权：`/api/v1/dtorole/*`
  - 构件/文档：`/projects/{id}/entities*`、`/projects/{id}/documents*`
  - 计量结算：`/api/v1/boqitem/*`、`/api/v1/layerpeg/*`
  - Proof：`/api/v1/proof/{id}`、`/api/v1/proof/{id}/attachments`
- 生成报告页（Reports）
  - 已接：通过 `triprole/trips` 聚合报告数据（空数据可正常展示）
- 照片上传
  - 已接：`/api/v1/files/upload`（失败回退 `/upload` 兼容）

### 3.2 页面保留但当前为占位/空实现（符合“无接口先空态”原则）

- 团队管理（Team）：接口文档未提供团队 CRUD，当前空列表+提示。
- DTO 权限页（Permissions）：页面保留，当前主要是前端矩阵展示与本地/占位保存。
- 系统设置（Settings）：页面保留；部分上传走新 API，其余为占位提示。

### 3.3 仍需补齐（页面调用层，不是 Hook 缺失）

- Proof 主面板（`activeTab=proof`）在 `DOCPEG_ONLY_MODE` 下仍走空实现分支（禁用了 `verify/stats/nodeTree` 实际请求）。
- Reports 页“验证 Proof”按钮当前仍走 `useProof().verify` 占位逻辑，未切到 `useQCSpecDocPegApi().verify`。

---

## 4. 旧后端清理状态（services/api）

已收敛为最小后端壳：

- 保留：
  - 认证：`/v1/auth/*`
  - DTO 代理：`/v1/dtorole/*`、`/api/v1/dtorole/*`
  - 上传代理：`/upload`、`/api/v1/files/upload`
  - 基础：`/health`
- 路由目录仅剩：`auth.py`、`dtorole_proxy.py`、`upload_proxy.py`

说明：这与“前端对接同事 API、本地后端仅保留鉴权/跨域/上传/DTO壳”目标一致。

---

## 5. 本轮核查结论

- 旧业务后端大模块已清理，剩余后端为必要代理壳。
- 新 API 在前端 Hook 层覆盖完整（P0 已全覆盖）。
- 页面层仍有少量“占位调用未切换”点（主要在 Proof/Reports），不影响页面保留，但会影响“全部功能都走新 API”的最终目标。

---

## 6. 下一步建议（按优先级）

1. 将 Reports 页的 Proof 验证按钮改为直接调用 `useQCSpecDocPegApi().verify`。
2. 打开 Proof 主面板真实请求（取消 `DOCPEG_ONLY_MODE` 下的 `verify/stats/nodeTree` 空实现分支）。
3. 保持 Team/Permissions/Settings 页面结构不变，等待同事 API 到位后逐项替换占位实现。
