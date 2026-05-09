# 路基弯沉

## 规范来源
JTG F80/1-2017 第4.2.x条

## 适用范围
适用于路基弯沉检测场景，用于验证实测弯沉是否满足允许控制值，支持自动判定与审计留痕。

## 检测步骤
1. 采集实测弯沉值。
2. 录入允许最大弯沉值。
3. 系统执行输出赋值与规则判定。
4. 完成试验与监理签名后进入归档流程。

## 合格标准
弯沉必须满足：`measuredDeflection <= maxAllowedDeflection`。

## 输入参数
- `measuredDeflection`：实测弯沉
- `maxAllowedDeflection`：允许最大弯沉

## 系统对接说明
- 规则中的 `value` 支持引用输入字段名（`maxAllowedDeflection`）。
- 导入后可直接复用统一 Runtime 引擎执行。
- 结果自动进入 Gate、签名、Proof 流程。
