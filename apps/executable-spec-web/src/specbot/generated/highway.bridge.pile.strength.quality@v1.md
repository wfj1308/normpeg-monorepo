# Bridge Pile Strength

> 规范来源：JTG/T 3650-2020 第 6.3.4 条
> SPU版本：v1

---

## 一、适用范围

适用于 JTG/T 3650-2020 第 6.3.4 条对应的「Bridge Pile Strength」检测场景。

---

## 二、检测步骤

1. calc_pile_strength: `pileStrength = measuredStrength`
2. calc_strength_ratio: `strengthRatio = (pileStrength / designStrength) * 100`
3. calc_length_check: `lengthCheck = pileLength`

---

## 三、合格标准

* Measured pile strength must be at least design strength.（Bridge Pile Strength >= 100）

---

## 四、输入参数

* Measured compressive strength (MPa)（数值，字段名：`measuredStrength`）
* Design strength (MPa)（数值，字段名：`designStrength`）
* Pile length (m)（数值，字段名：`pileLength`）

---

## 五、系统对接

```json
{
  "jsonRef": "highway.bridge.pile.strength.quality@v1.json",
  "markdownRef": "highway.bridge.pile.strength.quality@v1.md",
  "specId": "highway.bridge.pile.strength.quality@v1",
  "format": "SPU-v1",
  "generatedBy": "SpecBot-v1.0",
  "jsonPayloadSha256": "2dbebdd25a5bbf32defb1ad9f15eb7734bd80e5e3dd090aca4570209136739c7"
}
```
