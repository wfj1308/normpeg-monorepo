# 附录B：空间模型与容器边界

## 范围
来源于历史章节：18、23、27。

## B1. 基础对象
- Space Slot：纯地理地址（桩号/坐标/GPS）。
- Space Container：地址 + 规范 + 状态（逻辑执行边界）。
- Volume Container：工程量边界（物理计量边界）。

## B2. 关键结论
- 坐标是地址，容器是执行实例。
- `container` 决定执行规则，`volume` 决定计量与结算。
- 两者绑定后形成可执行、可结算、可追溯边界。

## B3. Mapping API 角色
- 空间键：桩号不是普通字段，是 Spatial Key。
- 核心查询：`/resolve`、`/query-range`、`/reverse`、`/history`。
- 枢纽作用：连接空间、规范、状态、Proof、BOQ。

## B4. 生命周期
1. 设计阶段：CAD/BIM 产出 Space Slot。
2. 施工阶段：Slot 实例化为 Space Container。
3. 验收阶段：生成 Proof，Container 归档，Slot 复用。
