# 页面对照审计：`layerpeg-architecture.full.backup.md`

更新时间：2026-04-24  
审计对象：
- 页面入口：`apps/executable-spec-web/src/SPUApp.tsx`
- 页面入口：`apps/nl2gate-web/src/App.tsx`
- Web 侧聚合 API：`apps/executable-spec-web/server/platform-api.ts`
- Backend API：`backend/app/main.py`
- 架构基线：`docs/layerpeg-architecture.full.backup.md`

---

## 1. 结论（先看）

1. 不是“样式坏了”，而是“信息架构超载”：单页承载过多模块，导致认知负担大。  
2. 当前实现**覆盖了执行演示主链路**，但离 backup 文档里的**产品化形态**仍有明显差距。  
3. 系统处于“执行内核可跑、产品入口待收口”的阶段：核心能力多为**部分完成**，不是全缺失。

---

## 2. 为什么页面看起来乱

### 2.1 单页混装过多语义（主因）

`SPUApp.tsx` 在同一页面里同时承载：
- Builder（模板、PDF、Markdown）
- Executor（选规范、执行、签字、复检）
- Runtime（slot/container、调度、归档）
- Debug（NormRef API 矩阵）
- LayerPeg 文档账本
- 构件目录
- NL2Gate 技术入口

结果：用户在一个页面里看到“产品流程 + 联调控制台 + 诊断工具”混在一起，信息层级失真。

### 2.2 两套体验并行，视觉与叙事未统一

- `executable-spec-web`：浅色执行演示流（Builder/Executor/Runtime）
- `nl2gate-web`：深色 Step0/1/2/3 工作台（规则数字化流程）

两套产品都在表达“主入口”，但没有统一 IA（Information Architecture）与视觉系统。

### 2.3 API 失败告警过于抢眼

`localhost:8790` 不可达时，页面会持续出现显著报错提示。  
在演示/开发环境下，这会放大“页面乱”的感受。

### 2.4 backup 文档目标与当前页面形态不一致

backup 文档（第 29 章）强调：
- MarkUnit 作为主工作台
- PegUnit 作为侧栏案例助手
- 不跳出写作流

当前页面是“多卡片长页演示控制台”，方向更偏联调而非产品入口。

---

## 3. 对照矩阵（完成度）

状态定义：
- 已完成：页面与能力都可用
- 部分完成：能力有，但形态/一致性未收口
- 仍缺失：backup 要求的能力在页面与接口都未闭环
- 偏离方向：有实现，但与 backup 推荐产品形态不一致

| backup 主题 | 目标 | 当前页面/接口现状 | 状态 |
| --- | --- | --- | --- |
| 第 5.3 / 第 9 章 执行闭环 | Path -> Gate -> State -> Proof | `SPUApp` 的执行、签字、归档链路可跑；API 也覆盖 `path/gate/state/proof` | 已完成 |
| 第 6 章 LayerPeg Document | Header/Gate/Body/Proof/State 一体化文档 | 已有文档生成与查询、索引列表 | 部分完成 |
| 文档账本索引（vuri/project/type） | 任意对象可统一索引查询 | 现有查询更偏 `docType/sourceRefPrefix`，三维统一索引不足 | 部分完成 |
| 第 5.1 协议层 ProjectUTXO | 项目主权状态根 + 分支变更 | Web 与 Backend 均有 UTXO 与分支能力 | 部分完成 |
| Fork/Split/Merge 可追溯 | 审计字段、评审态、合并证明 | Backend 较完整，Web 侧对象相对轻量，模型未统一 | 部分完成 |
| Space Slot / Space Container / Volume Container | 地址/执行/工程量三分层 | Slot/SpaceContainer 已落地，VolumeContainer 仍偏弱（多为 `volume_ref`） | 部分完成 |
| Mapping Kernel Full | stake/vuri/range 统一查询 + 回写摘要 | resolve/query-range/sync 已有；页面聚合视角仍偏执行态 | 部分完成 |
| 第 29 章 MarkUnit + PegUnit 主从关系 | 写作主流内侧栏复用案例 | 当前没有正式 MarkUnit/PegUnit 主入口页 | 仍缺失 |
| 第 26 章 CSD 自动生成 | 基于 container/spec/state 生成草稿 | 有 scheduler/runtime 模型基础，未形成 CSD 草稿产品入口 | 部分完成 |
| PegBot/规范机器人产品化（第 30 章） | 问规范、清单、溯源、会签 | 有 NL2Gate 和候选审批演示，但仍偏 demo 流程 | 部分完成 |
| 服务/API 矩阵（第 8/24 章） | spec/spu/gate/path/state/proof/mapping + 扩展层 | API 面覆盖较全，前后端并行实现导致契约分叉风险 | 部分完成 |
| 第 7 层外部锚定 | proof 外部 anchor | IPFS provider 已接入，保留 mock | 部分完成 |
| 第 29.5 推荐界面形态 | 写作区 + PegUnit 侧栏，少跳转 | 当前主页面是多模块控制台长页 | 偏离方向 |

---

## 4. 哪些是“做了但不该这样做”（偏离点）

1. 把产品功能和调试能力放同一个长页承载（应路由分层）。  
2. 两套入口并行，没有统一“哪个是主产品入口”。  
3. backup 推荐“写作流中心”的 MarkUnit/PegUnit 关系，当前未落到主入口。  
4. 协议层对象在 Web/Backend 双栈重复，字段与行为有分叉风险。

---

## 5. 可执行优化顺序（建议）

### P0（先降噪，1 个迭代内）

1. 页面拆路由：`/builder` `/executor` `/runtime` `/debug`，从单页长滚动改为分域。  
2. 全局仅保留 1 个 API 健康状态条，避免各区重复报错噪音。  
3. 明确主入口：以 `executable-spec-web` 为主，`nl2gate-web` 定位为实验/专题页或合并为子路由。

P0 执行进展（2026-04-24）：
- 已完成：模块路径路由归一化（含 debug 可见性回退），支持 `/builder` `/executor` `/runtime` `/debug` 直达。
- 已完成：平台 API 健康状态统一为单一全局提示条，连接失败可集中重试。
- 已完成：主入口分层已在 `SPUApp` 明确展示（主入口 vs 专题入口）。
- 部分完成：`nl2gate-web` 已接入 `executable-spec-web` 的 `/debug/nl2gate` 子路由（嵌入式承载）；仍保留独立应用形态，尚未完成代码层彻底合并。

### P1（按 backup 方向收口，2~3 个迭代）

1. 新建 MarkUnit 主页面（Markdown 编辑 + 引用插入）。  
2. 新建 PegUnit 侧栏（案例浏览、Fork 草案、Diff）。  
3. 基于现有 scheduler/runtime 产出 CSD 最小草稿页面（不是仅展示 JSON）。

### P2（模型一致性）

1. 对齐 Web/Backend 的 ProjectUTXO / Fork-Split-Merge 字段模型。  
2. 把 DocumentLedger 升级为 `vuri/project/type` 三维索引查询。  
3. 补强 VolumeContainer 独立对象，不再仅 `volume_ref` 引用。

---

## 6. 对“是否全部完成 backup 内容”的直接回答

不是。  

- **执行演示链路**：完成度高。  
- **协议统一与文档账本**：已落地但未完全收口。  
- **MarkUnit/PegUnit/CSD 产品化入口**：仍是主要缺口。  
- **页面形态**：当前更像“功能控制台”，与 backup 的“主工作台 + 侧栏助手”目标存在方向偏差。
