# Step 2 - Proof Schemas 拆分与路由前缀收口

## 1. 目标

解决两个高耦合点：

1. `services/api/domain/proof/schemas.py` 过大、职责混杂。
2. `services/api/routers/__init__.py` 多模块共用 `/v1/proof`，边界不清晰。

本步要求“先拆结构，再做兼容”，不做破坏式切换。

## 2. 当前基线

1. `services/api/domain/proof/schemas.py` 同时包含 UTXO、Trip、SMU、文档治理、GateRule、组件绑定等模型。
2. `/v1/proof` 当前承载 `documents/boq/proof/utxo/smu/execution/intelligence/finance/specification` 等路由。

## 3. Schemas 拆分方案

## 3.1 目录布局

新增目录：

1. `services/api/domain/proof/schemas/`
2. `services/api/domain/proof/schemas/utxo_models.py`
3. `services/api/domain/proof/schemas/trip_models.py`
4. `services/api/domain/proof/schemas/docfinal_models.py`
5. `services/api/domain/proof/schemas/finance_models.py`
6. `services/api/domain/proof/schemas/component_models.py`
7. `services/api/domain/proof/schemas/gate_models.py`
8. `services/api/domain/proof/schemas/document_models.py`
9. `services/api/domain/proof/schemas/smu_models.py`

过渡文件：

1. `services/api/domain/proof/schemas.py` 保留为兼容导出入口，只做 import + `__all__`。

## 3.2 迁移原则

1. 按“模型归属”切分，不改字段名和默认值。
2. 每个模型迁移后立即跑依赖测试，避免一次性大改。
3. 兼容期内保持 `from services.api.domain.proof.schemas import XxxBody` 可用。

## 4. 路由前缀收口方案

目标：新前缀更语义化，旧前缀保留兼容窗口。

建议分组：

1. `DocPeg Kernel`: `/v1/docpeg/proof`, `/v1/docpeg/utxo`, `/v1/docpeg/smu`, `/v1/docpeg/verify`
2. `QCSpec Product`: `/v1/qcspec/boq`, `/v1/qcspec/execution`, `/v1/qcspec/intelligence`, `/v1/qcspec/finance`
3. `DocFinal Product`: `/v1/docfinal/documents`, `/v1/docfinal/reports`
4. `NormRef Product`: `/v1/normref/specir`, `/v1/normref/specification`

兼容策略：

1. 旧 `/v1/proof/*` 路由继续注册 1 个版本周期。
2. 旧路由响应头加 `Deprecation` 与替代地址提示。
3. OpenAPI 文档同时展示新旧路径，标记旧路径为 deprecated。

## 5. 文件级实施清单

1. 编辑 `services/api/domain/proof/schemas.py`，改为聚合导出。
2. 新增 `services/api/domain/proof/schemas/*.py` 分模块模型文件。
3. 编辑 `services/api/routers/__init__.py`，将 registry 按产品与内核分段。
4. 如需，新增路由别名文件：`services/api/routers/docpeg_*.py`、`services/api/routers/qcspec_*.py`。

## 6. 验收标准

1. Schema 拆分后，所有现有请求体校验行为一致。
2. 新旧路由均可调用，返回一致。
3. OpenAPI 文档可清楚区分内核路径与产品路径。

建议命令：

```powershell
pytest services/api/tests -k "proof or schema or router"
python -m compileall services/api
```

## 7. 风险与控制

风险：

1. 模型迁移时导入路径遗漏，导致运行期异常。
2. 路由重复注册导致冲突或覆盖。

控制：

1. 每次只迁一个模型簇并运行最小回归。
2. registry 增加重复 path 检查脚本。
3. 兼容期内禁止删除旧路由处理函数。

## 8. 输出物

1. 模型按领域拆分完成。
2. 路由前缀新旧并行完成。
3. 弃用计划（deprecation schedule）落文档。

