# 规范解析全链路 Confidence 机制

## 1) confidence 字段设计
以下对象统一支持 `confidence: number(0~1)`：
- Document IR block
- Catalog node
- normRef
- SpecIR
- Rule
- Gate
- Component

推荐附带：
- `confidence_level`: `high | medium | low`
- `confidence_reason`（可选）

## 2) 阈值规则
- `high`: `confidence >= 0.92`
- `medium`: `0.75 <= confidence < 0.92`
- `low`: `confidence < 0.75`

流程策略：
- `low`：必须进入人工校验队列（优先级最高）
- `medium`：可生成，但发布前必须抽检
- `high`：可自动通过，保留审计记录

## 3) 页面展示方案
1. 增加 confidence 分布图：
- 总体 high/medium/low
- 分对象（Document IR/Catalog/normRef/SpecIR/Rule/Gate/Component）

2. 人工校验列表：
- 按 `low -> medium -> high` 排序
- 显示每项 confidence 与等级

3. 发布前检查区：
- 显示“low confidence 剩余数量”
- 同时展示 medium/high 计数，供抽检与审计决策
