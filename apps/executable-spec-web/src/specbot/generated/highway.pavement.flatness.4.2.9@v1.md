# 路面平整度

> 规范来源：JTG F80/1-2017 第 4.2.9 条
> SPU 版本：v1

---

## 这是 bot.normref.com，规范翻译机器人

不是查规范，是执行规范。

---

## 一、适用范围

适用于 JTG F80/1-2017 第 4.2.9 条对应的“路面平整度”检测与自动判定场景。

---

## 二、检测步骤

1. calc_flatness_value: `flatnessValue = measuredFlatness`
2. calc_flatness_margin: `flatnessMargin = maxAllowedFlatness - flatnessValue`

---

## 三、合格标准

* 路面平整度 必须 <= 输入参数 maxAllowedFlatness

---

## 四、输入参数

* 实测平整度(mm)（数值，字段名：`measuredFlatness`）
* 允许平整度(mm)（数值，字段名：`maxAllowedFlatness`）

---

## 五、系统对接

```json
{
  "jsonRef": "highway.pavement.flatness.4.2.9@v1.json",
  "format": "SPU-v1",
  "specId": "highway.pavement.flatness.4.2.9@v1",
  "generatedBy": "SpecBot-v1.0"
}
```
