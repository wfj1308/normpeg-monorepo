# Step 1 - 结构重构（不改行为）与适配层方案

## 1. 目标

在不改变现有 API 行为和前端可见功能的前提下，先把“内核能力”和“业务能力”做结构隔离，为后续 Step 2-4 提供稳定底座。

本步只做三件事：

1. 建立清晰目录骨架。
2. 给旧路径加兼容适配层（shim/re-export）。
3. 用自动化测试锁住边界，防止回流耦合。

## 2. 当前问题（基线）

1. `services/api/core/norm/service.py` 直接依赖 `services.api.domain.boq.runtime.specdict_gate`，出现反向依赖风险。
2. `services/api/routers/__init__.py` 中大量能力挤在 `/v1/proof` 前缀，不利于领域隔离。
3. 业务实现与协议内核混在同层目录，阅读和演进成本高。

## 3. 目标结构（先搭骨架）

建议先新增以下目录，不立即搬空历史实现：

1. `services/api/core/docpeg/`
2. `services/api/core/docpeg/proof/`
3. `services/api/core/docpeg/utxo/`
4. `services/api/core/docpeg/trip/`
5. `services/api/core/docpeg/normref/`
6. `services/api/core/docpeg/audit/`
7. `services/api/products/qcspec/`
8. `services/api/products/docfinal/`
9. `services/api/products/railpact/`
10. `services/api/products/normref/`

说明：

1. `core/docpeg` 只放协议内核与抽象端口，不放 QCSpec 业务分支。
2. `products/*` 承载面向用户的产品编排。
3. `domain/*` 在过渡期保留，逐步迁移。

## 4. 实施清单（可执行）

### 4.1 新增包与占位导出

1. 为上述目录补 `__init__.py`。
2. 每个新模块先以“薄封装”方式导出现有实现，避免一次性搬迁大文件。
3. 在 `services/api/domain/*` 旧模块保留 re-export，保证外部 import 不断。

### 4.2 引入适配层约定

1. 所有新调用优先走新路径。
2. 旧路径打 `TODO(stepX-remove)` 注释，标明淘汰时间点。
3. 新增 `docs/refactor/refactor-progress-dashboard.md` 的迁移打点，记录每个模块状态。

### 4.3 边界守卫

新增或强化 3 类测试：

1. `services/api/tests/test_domain_import_boundaries.py`
2. `services/api/tests/test_router_import_boundaries.py`
3. 新增 `services/api/tests/test_core_no_domain_reverse_imports.py`

规则重点：

1. `core/*` 不允许 import `domain/*` 具体实现。
2. `routers/*` 不直接 import runtime 细节函数。
3. 业务模块跨域调用通过 `integrations.py` 或显式 port。

## 5. 验收标准

1. 对外 API 路径、请求参数、返回结构无破坏变化。
2. 现有前端主链（登录、项目管理、开始质检、报告、Proof）可继续跑通。
3. 边界测试通过，且新增反向依赖测试为绿。

建议命令：

```powershell
pytest services/api/tests/test_domain_import_boundaries.py
pytest services/api/tests/test_router_import_boundaries.py
pytest services/api/tests/test_core_no_domain_reverse_imports.py
```

## 6. 风险与回滚

风险：

1. 兼容导出遗漏导致 import error。
2. 目录迁移时循环依赖暴露。

回滚：

1. 保留每批次小提交，按目录级回退。
2. 新路径失败时临时回指旧实现，不触及业务逻辑。

## 7. 输出物

1. 新目录骨架与包初始化完成。
2. 旧路径兼容层到位。
3. 边界测试可执行并纳入 CI。


