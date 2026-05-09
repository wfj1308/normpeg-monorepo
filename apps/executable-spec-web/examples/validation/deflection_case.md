# 路基弯沉
规范来源：JTG F80/1-2017
条款号：4.4.1
版本：v1
分类：subgrade
检测项：deflection

## 输入参数
- measuredDeflection | number | 0.01mm | 实测弯沉
- maxAllowedDeflection | number | 0.01mm | 允许最大弯沉

## 输出参数
- deflectionMargin

## 计算步骤
1. deflectionMargin = maxAllowedDeflection - measuredDeflection

## 判定规则
- measuredDeflection <= maxAllowedDeflection | 实测弯沉不得超过允许值

## 签字要求
- lab
- supervision

## 依赖
- none
