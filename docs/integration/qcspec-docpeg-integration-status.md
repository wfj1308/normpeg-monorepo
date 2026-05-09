# QCSpec × DocPeg 联调全通验收清单（当前状态）

更新时间：2026-04-10

## 1. 总体结论

- 当前状态：核心业务链路已落到 QCSpec 页面内，但未达到“联调全通”。
- 关键原因：真实环境仍缺“有效业务参数 + 完整鉴权”的全量接口绿灯记录。

## 2. 已完成（代码级）

- Web 已接同事侧 API Hook（`process-chains / bindings / normref/forms / trips / signpeg`）。
- Web Hook 已升级为“新接口优先 + 旧路径兼容”：
  - NormRef：优先 `/api/v1/normref/projects/{projectId}/...`，兼容 `/projects/{projectId}/normref/...`
  - 写接口默认自动附带 `x-actor-role / x-actor-name`（可通过环境变量覆盖）
  - 新增：`/projects`、`/projects/{id}`、`/api/v1/triprole/*`、`/api/v1/dtorole/permission-check`
  - 新增：`/api/v1/boqitem/projects/{id}/{items|nodes|utxos}`
  - 新增：`/api/v1/layerpeg/{chain-status|anchor}`、`/health`、`/openapi.json`、`/api/v1/docpeg/summary`
- 质检提交页（InspectionForm）已嵌入联动：
  - 质检保存后调用 `trips/preview -> trips/submit -> summary/recommend`
- 质检提交页已补闭环关键动作：
  - `dtorole/permission-check` 判权通过后才继续 Trip 提交
  - Trip 提交后回查 `triprole/trips`（工序状态）
  - 用 `layerpeg/anchor` 写入追溯锚点（可审计链路）
- `chainId` 缺失时支持 `bindings/by-entity` 自动补全（已修复短路问题）。
- 后端能力已具备：
  - NormRef 规则（`/v1/normref/rules*`, `/v1/normref/validate`）
  - TripRole 执行（`/v1/proof/triprole/execute`）
  - SignPeg（`/api/v1/signpeg/sign|verify|status`）

## 3. 自测结果（2026-04-10）

### 3.1 真实探测（占位参数、无鉴权）

运行命令：

```powershell
powershell -ExecutionPolicy Bypass -File tools/acceptance/docpeg_joint_debug_smoke.ps1 `
  -ProjectId sim-project -ChainId sim-chain -EntityUri entity://sim `
  -ComponentUri v://sim/component/001 -FormCode qc-form-001 -DocId doc-sim-001 `
  -OutputFile tmp/docpeg_joint_debug_probe_real.json
```

结论：

- `normref-forms`、`signpeg-status` 返回 200（接口在线）。
- 多个 `process-chains` 在占位参数下返回 404（参数不真实，无法判定业务失败）。
- `normref-form-detail` 返回 404，`latest-draft/latest-submitted` 返回 400（表单编码或上下文不匹配）。

### 3.2 模拟全链路（脚本仿真）

运行命令：

```powershell
powershell -ExecutionPolicy Bypass -File tools/acceptance/docpeg_joint_debug_smoke.ps1 `
  -ProjectId sim-project -ChainId sim-chain -EntityUri entity://sim `
  -ComponentUri v://sim/component/001 -FormCode qc-form-001 -DocId doc-sim-001 `
  -RunWriteOps -Simulate -OutputFile tmp/docpeg_joint_debug_probe_simulated.json
```

结论：

- 读写步骤可完整串联（含 `interpret/draft/submit/trips/sign/verify/status`）。
- 脚本流程正确，但不等价于真实环境全通。

## 4. 部分完成（还差最后一段）

- “下一 Trip”目前仅推荐提示，尚未自动创建下一执行实例。
- QCSpec 主链仍以 `inspections` 为中心，未完全切为 TripRole-first。
- DTORole 能力存在，但还未收口成统一 `DocPeg API` 入口。

## 5. 未完成（阻断“全通”）

- 统一入口 API 未落地：
  - `POST /api/docpeg/documents`
  - `POST /api/docpeg/trips`
  - `GET /api/triproles`
- 同事侧全量接口缺“真实参数 + 鉴权 + 双方签字”验收报告。
- NormRef Agent 的 Updater/Guard/VersionManager 仍以方案文档为主，未服务化。

## 6. 页面验证示例（给前台同事）

1. 打开“质检录入”页，勾选“启用提交后自动联动”。
2. 录入真实 `projectId/component_uri`，`chainId` 可先留空（验证自动绑定）。
3. 点击“查询链状态”确认 `status` 可读。
4. 提交一条质检记录，观察页面状态区：
   - 预期出现“DocPeg syncing: preview -> submit -> synced”
   - 成功后显示 `Trip Proof` 或 `Next action`
5. 若失败，保留 `x-trace-id` 与响应错误，回填联调问题池。

## 7. 接口级验收清单（全绿标准）

### A. 工序链

- [ ] `GET /projects/{projectId}/process-chains/status`
- [ ] `GET /projects/{projectId}/process-chains/{chainId}/summary`
- [ ] `GET /projects/{projectId}/process-chains/{chainId}/list`
- [ ] `GET /projects/{projectId}/process-chains/list`
- [ ] `GET /projects/{projectId}/process-chains/recommend`
- [ ] `GET /projects/{projectId}/process-chains/dependencies`
- [ ] `POST /api/v1/trips/preview`（含兼容 `/trips/preview`）
- [ ] `POST /api/v1/trips/submit`（含兼容 `/trips/submit`）

### B. 分项绑定

- [ ] `GET /projects/{projectId}/process-chains/bindings`
- [ ] `POST /projects/{projectId}/process-chains/bindings`
- [ ] `GET /projects/{projectId}/process-chains/bindings/by-entity`

### C. NormRef 表单

- [ ] `GET /projects/{projectId}/normref/forms`
- [ ] `GET /api/v1/normref/projects/{projectId}/forms`
- [ ] `GET /projects/{projectId}/normref/forms/{formCode}`
- [ ] `GET /api/v1/normref/projects/{projectId}/forms/{formCode}`
- [ ] `POST /projects/{projectId}/normref/forms/{formCode}/interpret-preview`
- [ ] `POST /api/v1/normref/projects/{projectId}/forms/{formCode}/interpret-preview`
- [ ] `POST /projects/{projectId}/normref/forms/{formCode}/draft-instances`
- [ ] `POST /api/v1/normref/projects/{projectId}/forms/{formCode}/draft-instances`
- [ ] `GET /projects/{projectId}/normref/forms/{formCode}/draft-instances/latest`
- [ ] `GET /api/v1/normref/projects/{projectId}/forms/{formCode}/draft-instances/latest`
- [ ] `POST /projects/{projectId}/normref/forms/{formCode}/draft-instances/{instanceId}/submit`
- [ ] `POST /api/v1/normref/projects/{projectId}/forms/{formCode}/draft-instances/{instanceId}/submit`
- [ ] `GET /projects/{projectId}/normref/forms/{formCode}/latest-submitted`
- [ ] `GET /api/v1/normref/projects/{projectId}/forms/{formCode}/latest-submitted`

### E. 同事新增闭环接口

- [ ] `GET /projects`
- [ ] `GET /projects/{projectId}`
- [ ] `GET /api/v1/triprole/trips?project_id={projectId}`
- [ ] `POST /api/v1/triprole/preview`
- [ ] `POST /api/v1/triprole/submit`
- [ ] `GET /api/v1/dtorole/permission-check?permission=...&project_id=...`
- [ ] `GET /api/v1/boqitem/projects/{projectId}/items`
- [ ] `GET /api/v1/boqitem/projects/{projectId}/nodes`
- [ ] `GET /api/v1/boqitem/projects/{projectId}/utxos`
- [ ] `GET /api/v1/layerpeg/chain-status?project_id={projectId}`
- [ ] `POST /api/v1/layerpeg/anchor`
- [ ] `GET /api/v1/layerpeg/anchor?project_id={projectId}&entity_uri=...`
- [ ] `GET /health`
- [ ] `GET /openapi.json`
- [ ] `GET /api/v1/docpeg/summary`

### D. 签章与证明

- [ ] `POST /api/v1/signpeg/sign`
- [ ] `POST /api/v1/signpeg/verify`
- [ ] `GET /api/v1/signpeg/status/{docId}`

## 8. 建议推进顺序（3天）

1. D1：用同事提供的真实 `projectId/chainId/component_uri/formCode/docId` 跑通 A+B。
2. D2：跑通 C 全链路（预览->草稿->提交->回查），补幂等与错误码映射。
3. D3：跑通 D，并完成双方联合验收记录（含 trace 和样例响应）。

## 9. “全通”判定标准

- 接口清单全绿。
- 至少 3 组真实业务样例（正常/依赖不满足/签章未完成）可稳定复现。
- 页面可见状态与后端状态一致（`next_action`、`proof_id`、`all_signed`）。
- 联调报告完成双方签字归档。
