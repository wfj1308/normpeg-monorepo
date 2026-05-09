# DocPeg API 联调用例清单（QCSpec）

更新时间：2026-04-10

## 使用说明

1. 按顺序执行：先只读，再写入。
2. 每条用例记录 `x-trace-id`。
3. 失败时记录 HTTP 状态码、响应体关键字段与请求参数。

## P0：只读链路（必须通过）

1. `TC-RO-001` 分项绑定查询
   - 接口：`GET /projects/{projectId}/process-chains/bindings/by-entity?entity_uri=...`
   - 预期：返回当前实体绑定的 `chain_id` 或明确“未绑定”。

2. `TC-RO-002` 工序链状态查询
   - 接口：`GET /projects/{projectId}/process-chains/status`
   - Query：`chain_id/component_uri/pile_id/source_mode`
   - 预期：返回当前步骤、完成度、步骤实例摘要。

3. `TC-RO-003` 工序链摘要查询
   - 接口：`GET /projects/{projectId}/process-chains/{chainId}/summary`
   - 预期：返回步骤摘要、完成态、`final proof/boq` 状态。

4. `TC-RO-004` 推荐下一动作
   - 接口：`GET /projects/{projectId}/process-chains/recommend`
   - 预期：返回“下一动作/去处理”建议，且与 `status` 一致。

5. `TC-RO-005` 依赖图读取
   - 接口：`GET /projects/{projectId}/process-chains/dependencies`
   - 预期：返回步骤依赖关系，阻塞节点可识别。

6. `TC-RO-006` 表单目录读取
   - 接口：`GET /projects/{projectId}/normref/forms`
   - 预期：返回可用表单列表，至少包含一个 `formCode`。

7. `TC-RO-007` 单表模板读取
   - 接口：`GET /projects/{projectId}/normref/forms/{formCode}`
   - 预期：返回模板元信息（字段、约束、版本）。

8. `TC-RO-008` 最新草稿读取
   - 接口：`GET /projects/{projectId}/normref/forms/{formCode}/draft-instances/latest`
   - 预期：有草稿则返回最近草稿；无草稿则返回可解释空态。

9. `TC-RO-009` 最新已提交读取
   - 接口：`GET /projects/{projectId}/normref/forms/{formCode}/latest-submitted`
   - 预期：返回最近正式实例或明确空态。

10. `TC-RO-010` 签章状态读取
    - 接口：`GET /api/v1/signpeg/status/{docId}`
    - 预期：返回签章状态（如 `all_signed`、`proof_id`）。

## P0：写入链路（必须通过）

1. `TC-RW-001` 表单解释预览
   - 接口：`POST /projects/{projectId}/normref/forms/{formCode}/interpret-preview`
   - 预期：返回渲染前校验结果；字段错误可准确提示。

2. `TC-RW-002` 保存草稿
   - 接口：`POST /projects/{projectId}/normref/forms/{formCode}/draft-instances`
   - 预期：返回 `instanceId`（或等价字段）。

3. `TC-RW-003` 草稿提交
   - 接口：`POST /projects/{projectId}/normref/forms/{formCode}/draft-instances/{instanceId}/submit`
   - 预期：提交后 `latest-submitted` 可查到该实例。

4. `TC-RW-004` trips 预演
   - 接口：`POST /api/v1/trips/preview`（兼容 `/trips/preview`）
   - 预期：返回 gate 校验和状态推进预演结果。

5. `TC-RW-005` trips 正式提交
   - 接口：`POST /api/v1/trips/submit`（兼容 `/trips/submit`）
   - 预期：提交成功并触发链路状态推进。

6. `TC-RW-006` 签章
   - 接口：`POST /api/v1/signpeg/sign`
   - 预期：签章成功并生成可验签数据。

7. `TC-RW-007` 验签
   - 接口：`POST /api/v1/signpeg/verify`
   - 预期：验签通过；异常签名返回明确失败信息。

## P1：异常与幂等（建议通过）

1. `TC-ERR-001` 鉴权缺失
   - 条件：不带 `Authorization/x-api-key`
   - 预期：返回 `401/403`。

2. `TC-ERR-002` 必填参数缺失
   - 条件：缺 `projectId` 或 `chainId` 或 `component_uri`
   - 预期：返回 `4xx` 且指出缺失字段。

3. `TC-ERR-003` 依赖未满足即提交
   - 条件：在阻塞态执行 `trips/submit`
   - 预期：返回阻塞原因，不推进步骤。

4. `TC-ERR-004` 重复提交
   - 条件：同 `request_id` 重复提交
   - 预期：结果幂等，不重复写入。

5. `TC-ERR-005` 签章后篡改再验签
   - 条件：修改关键摘要字段后调用 `verify`
   - 预期：验签失败。

## 证据留存模板（每条用例）

1. 用例 ID
2. 请求时间（UTC）
3. `x-trace-id`
4. 请求 URL 与主要参数
5. HTTP 状态码
6. 响应关键字段（成功/失败都留）
7. 结论（PASS/FAIL）
8. 处理人
