# Pavement Flatness (IRI)

> 规范来源：JTG F80/1-2017 第 4.2.9 条
> SPU版本：v1

---

## 一、适用范围

适用于 JTG F80/1-2017 第 4.2.9 条对应的「Pavement Flatness (IRI)」检测场景。

---

## 二、检测步骤

1. calc_iri_value: `iriValue = iriMeasured`
2. calc_iri_margin: `iriMargin = iriLimit - iriValue`

---

## 三、合格标准

* IRI must be less than or equal to the limit.（Pavement Flatness (IRI) <= 输入参数 iriLimit）

---

## 四、输入参数

* Measured IRI (m/km)（数值，字段名：`iriMeasured`）
* IRI limit (m/km)（数值，字段名：`iriLimit`）

---

## 五、系统对接

```json
{
  "jsonRef": "highway.pavement.flatness.IRI@v1.json",
  "markdownRef": "highway.pavement.flatness.IRI@v1.md",
  "specId": "highway.pavement.flatness.IRI@v1",
  "format": "SPU-v1",
  "generatedBy": "SpecBot-v1.0",
  "jsonPayloadSha256": "9f681e905ce2031010aa642302156b03314f94194a3d2714bc230e7e70f30aa6"
}
```
