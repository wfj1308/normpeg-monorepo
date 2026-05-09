# Step 3 - 修复 Core 到 Domain 的反向依赖（先做 NormRefResolver）

## 1. 目标

把内核层 `core` 对业务层 `domain` 的直接实现依赖改为“端口 + 适配器”模式，优先处理 `NormRefResolverService`。

## 2. 当前问题

当前代码：

1. `services/api/core/norm/service.py` 直接 import `services.api.domain.boq.runtime.specdict_gate`。
2. 造成 `core -> domain` 反向耦合，后续拆产品层时难以迁移。

## 3. 目标架构

采用 Hexagonal 风格：

1. `core` 定义 Port（协议接口）。
2. `domain/specir` 或 `domain/boq` 提供 Adapter（实现接口）。
3. `dependencies.py` 负责注入，`core` 不感知具体实现来源。

## 4. 详细实施方案

### 4.1 在 core 定义端口

新增：

1. `services/api/core/norm/ports.py`

定义接口（示例职责）：

1. `resolve_threshold(gate_id, context) -> dict`
2. `get_spec_dict(spec_dict_key) -> dict`

`NormRefResolverService` 仅依赖该接口，不再直接 import `specdict_gate`。

### 4.2 在 domain 实现适配器

新增或改造：

1. `services/api/domain/specir/integrations.py`

提供：

1. `SpecirNormResolverAdapter`（或同等命名）
2. 内部可调用现有 `specdict_gate`/`specir.runtime.*` 逻辑

注意：

1. 适配器属于业务层，允许依赖 `domain` 内部实现。
2. 适配器对 `core` 只暴露 Port 约定字段。

### 4.3 依赖注入替换

修改：

1. `services/api/dependencies.py`

从“直接构造 `NormRefResolverService`”改为“注入 adapter 后构造”。

### 4.4 反向依赖守卫测试

新增：

1. `services/api/tests/test_core_no_domain_reverse_imports.py`

校验至少包含：

1. `services/api/core/**` 不能 import `services.api.domain.**`
2. 白名单仅允许 `services.api.core` 内部模块与基础设施抽象。

## 5. 验收标准

1. `services/api/core/norm/service.py` 不再出现 `domain` import。
2. NormRefResolver 功能结果与改造前一致。
3. 新增依赖守卫测试长期为绿。

建议命令：

```powershell
pytest services/api/tests/test_core_no_domain_reverse_imports.py
pytest services/api/tests -k "norm or specir or boq"
```

## 6. 风险与回滚

风险：

1. 端口字段定义不全导致行为漂移。
2. 注入层改造遗漏导致运行期 `None` 或构造错误。

回滚：

1. 保留 `NormRefResolverService` 原实现 tag。
2. 端口接入失败时可临时挂旧逻辑（仅短期），并记录差异。

## 7. 输出物

1. `core` 与 `domain` 间首个稳定端口实例（NormRefResolver）。
2. 可复用的“端口-适配器-注入”模板，可复制到 Proof/UTXO/Trip 其余模块。

