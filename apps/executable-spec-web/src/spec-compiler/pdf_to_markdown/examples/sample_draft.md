# 路基压实度（土质）

规范来源：JTG F80/1-2017
条款号：4.2.1
版本：v1
分类：subgrade
检测项：compaction

## 输入参数
- massHoleSand | number | g | 灌入砂质量
- volumeSand | number | cm3 | 标定体积
- moistureContent | number | % | 含水率
- maxDryDensity | number | g/cm3 | 最大干密度

## 输出参数
- wetDensity
- dryDensity
- compactionDegree

## 计算步骤
1. wetDensity = massHoleSand / volumeSand
2. dryDensity = wetDensity / (1 + moistureContent / 100)
3. compactionDegree = (dryDensity / maxDryDensity) * 100

## 判定规则
- compactionDegree >= 93 | 压实度必须 ≥ 93%

## 签字要求
- lab
- supervision

## 依赖
- none
