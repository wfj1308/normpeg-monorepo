# 高速公路实验室平台前端任务拆分（V1）

## 1. 用途

- 这份文档只做一件事：把页面需求变成可执行任务。
- 口径：`Issue -> Owner -> Estimate(PD) -> Dependency -> DoD`

## 2. 任务优先级

- `P0`：上线阻断
- `P1`：重要功能
- `P2`：优化项

## 3. M1（核心闭环，P0）

| Issue | 端 | 页面 | Owner | Estimate | Dependency | DoD |
|---|---|---|---|---|---|---|
| FE-M1-001 | Web | W01 登录/项目切换 | Web-A | 1.0 | 无 | 登录与项目上下文正确 |
| FE-M1-002 | Web | W03 实验室标列表/新建 | Web-A | 2.5 | FE-M1-001 | 可创建并查看挂载状态 |
| FE-M1-003 | Web | W04 样品列表/新建/详情 | Web-A | 2.5 | FE-M1-001 | 样品全流程基础可查可建 |
| FE-M1-004 | Web | W05 泳道与派发 | Web-B | 2.5 | FE-M1-001 | 任务可派发、可流转 |
| FE-M1-005 | Web | W06 三组值录入与判定 | Web-B | 3.0 | FE-M1-004 | Pass/Warn/Block 生效 |
| FE-M1-006 | Web | W07 复核页 | Web-B | 1.5 | FE-M1-005 | 通过/退回可用且留痕 |
| FE-M1-007 | Web | W08 签发页 | Web-B | 1.5 | FE-M1-006 | 签发后归档成功 |
| FE-M1-008 | Web | W09 Proof 检索 | Web-B | 1.5 | FE-M1-001 | 可按 v_uri 回查链路 |
| FE-M1-009 | Mobile | M01/M02 登录与待办 | Mobile-A | 2.0 | 无 | 待办可拉取可刷新 |
| FE-M1-010 | Mobile | M03 收样扫码 | Mobile-A | 2.0 | FE-M1-009 | 扫码收样可提交 |
| FE-M1-011 | Mobile | M04 制样执行 | Mobile-A | 1.5 | FE-M1-009 | 制样参数可提交 |
| FE-M1-012 | Mobile | M05 检测录入 | Mobile-B | 2.5 | FE-M1-009 | 三组值与判定正确 |
| FE-M1-013 | Common | 全局错误/阻断组件 | FE-Lead | 1.0 | FE-M1-001 | 错误码与阻断提示统一 |

M1 合计：`25.5 PD`

## 4. M2（质量链与治理）

| Issue | 端 | 页面 | Owner | Estimate | Dependency | DoD |
|---|---|---|---|---|---|---|
| FE-M2-001 | Web | W05 四阶段 QC 展示 | Web-B | 1.5 | FE-M1-004 | IQC/PQC/QQC/FQC 可视化 |
| FE-M2-002 | Web | W07 版本对比复核 | Web-B | 1.5 | FE-M1-006 | 当前版与上一版可对比 |
| FE-M2-003 | Web | W10 资质治理 | Web-A | 1.5 | FE-M1-001 | 到期预警与筛选可用 |
| FE-M2-004 | Web | W10 设备检定治理 | Web-A | 1.5 | FE-M1-001 | 失效状态可见并阻断提示 |
| FE-M2-005 | Web | W09 审计包导出交互 | Web-B | 1.0 | FE-M1-008 | 导出可触发可追踪 |
| FE-M2-006 | Mobile | M06 异常上报 | Mobile-B | 1.5 | FE-M1-009 | 异常可提交并关联任务 |
| FE-M2-007 | Mobile | M07 移动复核 | Mobile-B | 1.0 | FE-M1-012 | 通过/退回可用 |
| FE-M2-008 | Mobile | M09 同步日志与重试 | Mobile-A | 1.0 | FE-M1-009 | 失败同步可重试 |
| FE-M2-009 | Common | 跨端状态一致性校验 | FE-Lead | 1.5 | M1 全部 | 同任务跨端状态一致 |

M2 合计：`11.0 PD`

## 5. M3（运营与优化）

| Issue | 端 | 页面 | Owner | Estimate | Dependency | DoD |
|---|---|---|---|---|---|---|
| FE-M3-001 | Web | W02 项目看板 | Web-A | 2.0 | FE-M1-001 | 指标展示+钻取可用 |
| FE-M3-002 | Web | W11 可视化基础 | Web-A | 2.0 | FE-M1-001 | 地图态势可展示 |
| FE-M3-003 | Web | W11 视频联动 | Web-A | 1.5 | FE-M3-002 | 视频切换不丢上下文 |
| FE-M3-004 | Web | W09 时间轴性能优化 | Web-B | 1.0 | FE-M1-008 | 大数据量不卡顿 |
| FE-M3-005 | Mobile | M01/M09 离线冲突页 | Mobile-B | 1.5 | FE-M2-008 | 冲突可确认可回放 |
| FE-M3-006 | Common | 可用性优化（可读性/触达） | FE-Lead | 1.0 | M2 全部 | 可用性检查通过 |

M3 合计：`9.0 PD`

总计：`45.5 PD`

## 6. 公共基础任务（建议先做）

| Issue | 内容 | Owner | Estimate | DoD |
|---|---|---|---|---|
| FE-BASE-001 | 请求封装（鉴权头、幂等键、统一错误） | FE-Lead | 1.0 | 全页面统一请求层 |
| FE-BASE-002 | 权限门禁组件（显隐/禁用原因） | FE-Lead | 1.0 | 按角色和状态控制按钮 |
| FE-BASE-003 | 状态组件（Loading/Empty/Error/Blocked） | FE-Lead | 1.0 | 全站状态表现一致 |
| FE-BASE-004 | 埋点与 operation_id 透传 | FE-Lead | 0.8 | 关键操作可追踪 |

基础合计：`3.8 PD`

## 7. Sprint 建议（6 个）

1. Sprint 1：FE-BASE + FE-M1-001~003 + FE-M1-009
2. Sprint 2：FE-M1-004~008 + FE-M1-010~012
3. Sprint 3：FE-M1-013 + FE-M2-001~004
4. Sprint 4：FE-M2-005~009
5. Sprint 5：FE-M3-001~003
6. Sprint 6：FE-M3-004~006 + 回归优化

## 8. Jira 创建模板

- Summary：`[labpeg][frontend] FE-M1-005 W06 三组值录入与判定`
- Description：页面路径、交互步骤、接口依赖、验收标准
- Priority：P0/P1/P2
- Estimate：`x.x PD`
- Labels：`labpeg frontend web/mobile Wxx/Mxx`

## 9. 验收退出条件

1. P0 全部完成。
2. 主流程（收样 -> 检测 -> 复核 -> 签发 -> 追溯）跨端跑通。
3. Block/Warn/Pass 三态与权限门禁一致。
4. 无 S1/S2 阻塞缺陷。
