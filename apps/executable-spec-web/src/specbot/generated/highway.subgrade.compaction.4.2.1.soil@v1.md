# Subgrade Compaction (Soil)

> 规范来源：JTG F80/1-2017 第 4.2.1 条
> SPU版本：v1

---

## 一、适用范围

适用于 JTG F80/1-2017 第 4.2.1 条对应的「Subgrade Compaction (Soil)」检测场景。

---

## 二、检测步骤

1. calc_wet_density: `wetDensity = massHoleSand / volumeSand`
2. calc_dry_density: `dryDensity = wetDensity / (1 + moistureContent / 100)`
3. calc_compaction_degree: `compactionDegree = (dryDensity / maxDryDensity) * 100`

---

## 三、合格标准

* Compaction degree must be >= 93%（Subgrade Compaction (Soil) >= 93）

---

## 四、输入参数

* Mass of sand in hole (g)（数值，字段名：`massHoleSand`）
* Mass of sand in cone (g)（数值，字段名：`massSandCone`）
* Calibrated volume (cm3)（数值，字段名：`volumeSand`）
* Moisture content (%)（数值，字段名：`moistureContent`）
* Maximum dry density (g/cm3)（数值，字段名：`maxDryDensity`）

---

## 五、系统对接

```json
{
  "jsonRef": "highway.subgrade.compaction.4.2.1.soil@v1.json",
  "markdownRef": "highway.subgrade.compaction.4.2.1.soil@v1.md",
  "specId": "highway.subgrade.compaction.4.2.1.soil@v1",
  "format": "SPU-v1",
  "generatedBy": "SpecBot-v1.0",
  "jsonPayloadSha256": "40a4595d46de5c6f463d12c31cb658fba1bc297824feacb4d6e367fc35380dd5"
}
```
