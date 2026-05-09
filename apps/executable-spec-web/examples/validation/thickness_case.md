# 路基厚度
规范来源：JTG F80/1-2017
条款号：4.3.2
版本：v1
分类：subgrade
检测项：thickness

## 输入参数
- measuredThickness | number | mm | 实测厚度
- designThickness | number | mm | 设计厚度

## 输出参数
- thicknessDeviation
- thicknessRatio

## 计算步骤
1. thicknessDeviation = measuredThickness - designThickness
2. thicknessRatio = (measuredThickness / designThickness) * 100

## 判定规则
- measuredThickness >= designThickness | 实测厚度不得小于设计厚度

## 签字要求
- lab
- supervision

## 依赖
- none
