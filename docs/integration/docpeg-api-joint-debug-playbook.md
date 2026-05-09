# DocPeg API 联调执行手册（QCSpec）

更新时间：2026-04-10

## 1. 目标与范围

本联调只聚焦你同事侧已开放的 DocPeg API，目标是打通以下闭环：

1. 分项绑定 -> 工序链状态读取
2. NormRef 表单：模板读取 -> 草稿保存 -> 草稿提交 -> 已提交回查
3. Trip：`preview` 预演 -> `submit` 正式提交 -> 状态推进回读
4. 签章：`sign` -> `verify` -> `status`

不在本轮范围：

1. UI 视觉改版
2. 非 QCSpec 业务线接口改造
3. ERP 回写与财务结算链路

## 2. 联调基础配置

- Base URL：`https://api.docpeg.cn`
- 鉴权：沿用现网请求头（`Authorization` 或 `x-api-key`）
- 核心参数：
  - `projectId`
  - `chainId`
  - `component_uri`
  - `pile_id`
  - `inspection_location`
- 建议新增请求头：
  - `x-trace-id: qcspec-jd-<timestamp>-<seq>`
  - `x-client: qcspec-web`（或 `qcspec-mobile`）

## 3. 联调前置清单（必须先确认）

1. 双方统一接口环境：都连 `https://api.docpeg.cn`
2. 双方统一鉴权头：确认仅用 `Authorization` 还是同时带 `x-api-key`
3. 对方提供至少 3 组联调数据：
   - 正常可推进链路
   - 依赖未满足链路
   - 签章未完成链路
4. 双方冻结参数定义（必填、选填、默认值、互斥关系）
5. 双方确认时区与日期格式：统一 ISO-8601（UTC）

## 4. 分阶段落地方案

### 阶段 A：只读接口通路（T+0 当天完成）

目标：先把“看得见状态”打通，不写数据。

接口：

1. `GET /projects/{projectId}/process-chains/bindings/by-entity`
2. `GET /projects/{projectId}/process-chains/status`
3. `GET /projects/{projectId}/process-chains/{chainId}/summary`
4. `GET /projects/{projectId}/process-chains/recommend`
5. `GET /projects/{projectId}/process-chains/dependencies`
6. `GET /projects/{projectId}/normref/forms`
7. `GET /projects/{projectId}/normref/forms/{formCode}`
8. `GET /projects/{projectId}/normref/forms/{formCode}/draft-instances/latest`
9. `GET /projects/{projectId}/normref/forms/{formCode}/latest-submitted`
10. `GET /api/v1/signpeg/status/{docId}`

验收标准：

1. 所有只读接口都能返回 2xx
2. `status/summary/recommend` 对同一构件结果可互相印证
3. 草稿/已提交回查字段结构稳定（连续两次结果 schema 不漂移）

### 阶段 B：表单写入与提交（T+1）

目标：打通 NormRef 表单从草稿到正式提交。

接口：

1. `POST /projects/{projectId}/normref/forms/{formCode}/interpret-preview`
2. `POST /projects/{projectId}/normref/forms/{formCode}/draft-instances`
3. `POST /projects/{projectId}/normref/forms/{formCode}/draft-instances/{instanceId}/submit`

验收标准：

1. `interpret-preview` 能返回可解释结果或明确校验错误
2. 草稿可读回（latest）且内容一致
3. 提交后 `latest-submitted` 可查到最新实例

### 阶段 C：工序状态推进（T+1~T+2）

目标：让提交真正驱动流程向下一步推进。

接口：

1. `POST /api/v1/trips/preview`（兼容 `/trips/preview`）
2. `POST /api/v1/trips/submit`（兼容 `/trips/submit`）

验收标准：

1. `preview` 能看见 gate 评估结果
2. `submit` 后 `status/summary/recommend` 出现可解释变化
3. 重复提交可被幂等机制识别（建议带 `request_id`）

### 阶段 D：签章闭环（T+2）

目标：签章状态可追踪、可验签。

接口：

1. `POST /api/v1/signpeg/sign`
2. `POST /api/v1/signpeg/verify`
3. `GET /api/v1/signpeg/status/{docId}`

验收标准：

1. 签章后 `status` 可回查
2. 验签结果与签章状态一致
3. 业务可基于 `all_signed/proof_id` 驱动后续动作

## 5. 风险与防呆策略

1. 写接口默认不开启，先跑只读 smoke
2. 写接口统一带 `x-trace-id` 和幂等键 `request_id`
3. 每次提交后都回查 `status/summary`，防止“写入成功但状态未推进”
4. 错误码分层记录：
   - 4xx：参数、鉴权、依赖未满足
   - 5xx：服务异常或上游异常
5. 对方若有 schema 变更，先发变更清单再切换联调数据

## 6. 交付物（本仓库）

1. 联调执行手册（本文）：
   - `docs/integration/docpeg-api-joint-debug-playbook.md`
2. 联调测试用例清单：
   - `docs/integration/docpeg-api-joint-debug-testcases.md`
3. 一键 smoke 脚本（读接口默认执行，写接口可选）：
   - `tools/acceptance/docpeg_joint_debug_smoke.ps1`
4. 写接口 payload 模板：
   - `tools/acceptance/docpeg_joint_debug_payloads/*.json`

## 7. 每日联调节奏建议

1. 09:30 前：双方同步当天样本数据是否有效
2. 10:00：跑只读 smoke，确保基础通路正常
3. 14:00：跑写入链路（草稿/提交/trips/sign）
4. 17:30：汇总失败 case、trace-id、响应样例，更新问题池


