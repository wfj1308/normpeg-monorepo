# 附录C：服务与API深度设计

## 范围
来源于历史章节：22、23、24、25。

## C1. API 总矩阵（v1）
- 输入层：`pdf/image/voice`
- 核心层：`mapping/spu/spec`
- 执行层：`gate/path/state`
- 输出层：`proof/form/report`
- 资产层：`boq/price/contract`
- 身份层：`did/trip/sign`
- 系统层：`webhook/sync/export`

## C2. 三大独立核心API
- `api.normref.com/v1/pdf`：规范解析。
- `api.normref.com/v1/mapping`：空间纽带。
- `api.normref.com/v1/spu`：执行单元生成。

## C3. 对接包
- Postman：`normref-api.json`（6个核心请求）。
- SDK：`normref-sdk.ts`（parse/resolve/evaluate/generate/transition/verify）。
- Demo 目录：`/normref-demo`。

## C4. 设计原则
- 独立可演进：解析、执行、存证分离。
- 可审计：全链路日志 + Proof 可回放。
- 可扩展：BIM/ERP/IoT 插件式接入。
