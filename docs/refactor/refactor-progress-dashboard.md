# 前后端重构进度看板（持续更新）
更新时间：2026-04-02

## 当前阶段
- 整体阶段：中后期（约 80%~90%）
- 当前状态：可构建、可测试通过，正在做上线前收口与提交拆批

## 已完成（核心）
- 前端 `apps/web`：
  - `tsc --noEmit` 通过
  - `vite build` 通过
- 后端 `services/api`：
  - `compileall` 通过
  - OpenAPI 路由数稳定（134）
  - 测试通过（当前 125 passed）
- 架构边界：
  - `services/api/domain`（排除 `integrations.py`）已实现 0 处直连旧 `*_service/*_flow_service`
  - 域模块直连 `services.api.<root_module>` 清零（通过测试约束）
  - 新增自动化边界测试：
    - `services/api/tests/test_domain_import_boundaries.py`
    - `services/api/tests/test_router_import_boundaries.py`

## 仍未完成（上线前必须）
- 提交收口：
  - 当前工作区变更量仍大，尚未拆分为可审阅的 PR 批次
  - 仍需最终确认“应提交文件清单”与“应忽略文件清单”
- 重构收尾：
  - 仍有较多兼容 shim 文件，需分批评估保留/淘汰策略
  - 需为每一批重构补齐 PR 描述、回归记录与风险说明

## 下一步执行顺序（建议）
1. 先按后端重构批次拆分提交（边界层、领域服务层、路由接入层）
2. 清理不应提交的临时文件、日志文件、模拟文件
3. 生成标准 PR 说明（目标、范围、回归、风险、回滚）
4. 合并前再跑一轮全量验证（前端构建 + 后端测试）
