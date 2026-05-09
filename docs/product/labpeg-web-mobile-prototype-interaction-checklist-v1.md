# 高速公路实验室平台 Web/移动端原型交互清单（V1）

## 1. 用途

- 给产品/UI：明确每个页面要画什么、怎么交互。
- 给前端：明确页面行为、状态、校验、异常。
- 给测试：明确联调时要验什么。

## 2. 阅读顺序

1. 先读主需求文档：`labpeg-business-development-requirements-v1.md`
2. 再读本清单：页面和交互
3. 最后读任务拆分：`labpeg-frontend-development-task-breakdown-v1.md`

## 3. 页面清单（总览）

### 3.1 Web 页面

| 页面ID | 页面名 | 角色 |
|---|---|---|
| W01 | 登录与项目切换 | 全部 |
| W02 | Project Hub | Owner/PMO, LabManager |
| W03 | Lab Section Hub | LabManager |
| W04 | Sample Center | LabManager, LabReceiver |
| W05 | Trip Console | LabManager, Tester, Preparer |
| W06 | Test Workspace | Tester |
| W07 | Review Center | Reviewer |
| W08 | Sign Center | Signer |
| W09 | Proof Center | Auditor, Reviewer |
| W10 | Governance Center | LabManager, SystemAdmin |
| W11 | Visualization Studio | Owner/PMO, LabManager |

### 3.2 移动端页面

| 页面ID | 页面名 | 角色 |
|---|---|---|
| M01 | 登录与离线同步 | 全部 |
| M02 | 待办首页 | 全部 |
| M03 | 收样扫码 | Sampler, LabReceiver |
| M04 | 制样执行 | Preparer |
| M05 | 检测录入 | Tester |
| M06 | 异常上报 | 全部执行角色 |
| M07 | 移动复核 | Reviewer |
| M08 | 移动签发确认（可选） | Signer |
| M09 | 我的（同步日志） | 全部 |

## 4. 交互规则（统一）

1. 关键动作必须二次确认：提交、退回、签发、作废。
2. 所有阻断必须给出：阻断原因 + 修复建议 + 跳转入口。
3. 三组值规则固定：
   - `standard_value` 必填
   - `measured_value` 必填
   - `deviation_value` 只读（系统计算）
4. 状态必须统一：`Loading / Empty / Error / Blocked / Success`。
5. 成功提交后必须返回并展示 `operation_id`。

## 5. 核心页面交互（简版）

### 5.1 W03 Lab Section Hub

1. 新建实验室标：填编码、类型、桩号、GIS、服务标段。
2. 点击保存：实时校验编码唯一、GIS 格式。
3. 创建后自动轮询挂载任务。
4. 挂载完成前，`启用`按钮禁用。
5. 失败项可单项重试，并记录日志。

### 5.2 W05 Trip Console

1. 按角色泳道展示任务。
2. 卡片显示：样品编号、当前节点、剩余时效、风险等级。
3. 支持：接单、开始、提交、转派、回收。
4. 阻断时卡片红色高亮，操作按钮禁用。
5. 点击卡片进入步骤详情与证据链。

### 5.3 W06 Test Workspace

1. 自动带出标准值，不允许编辑。
2. 输入检测值后自动计算差值。
3. 实时返回判定：Pass / Warn / Block。
4. Warn 必填说明；Block 禁止提交。
5. 提交后进入待复核队列。

### 5.4 W07/W08 复核与签发

1. 复核支持通过/退回，退回必填原因。
2. 签发前校验签发权限与证书状态。
3. 签发成功后生成 FinalProof 并归档。

### 5.5 M03/M05 现场执行

1. 扫码进入任务或样品。
2. 弱网支持本地暂存，恢复网络后同步。
3. Block 状态下不能继续提交。
4. 同步冲突时进入冲突确认页，不可静默覆盖。

## 6. 页面原型标注要求（给 UI）

1. 每页必须标注：页面ID、入口、返回路径、适用角色。
2. 每个按钮必须标注：可见条件、可点击条件、调用接口。
3. 每个字段必须标注：是否必填、校验规则、错误文案。
4. 每页必须有 5 种状态稿：Loading、Empty、Error、Blocked、Success。

## 7. 联调验收清单（给前端+测试）

1. Web/移动端同一状态的按钮可用性一致。
2. 所有阻断原因文案一致且可追溯。
3. 三组值缺失时，流程无法进入签发。
4. 提交后可在 Proof Center 反查对应操作。
5. 离线重连后无重复提交、无数据丢失。

## 8. 与主需求映射

| 页面 | 主需求章节 |
|---|---|
| W03 | 5.2、6.1、7.1 |
| W05 | 5.4、6.3、7.2 |
| W06 | 5.5、6.4 |
| W07/W08 | 5.6、6.5 |
| W09 | 5.8、6.5、7.3 |
| M03/M05 | 5.3、5.5、6.2~6.4 |

## 9. DoD

1. 页面行为与主需求一致。
2. 原型评审通过后可直接拆成 Jira 任务。
3. 联调通过后可进入 UAT。
