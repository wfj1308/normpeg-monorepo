# v://normref.com/qc/rebar-processing@v1

**元数据 (Anchor)**
- norm_code: GB50204-2015 5.3.2 + JTG F80/1-2017
- boq_item_id: 403-1-2
- description: 钢筋加工及安装（制作、运输、安装、焊接）
- applicable_component: ["pile", "pier", "cap", "beam"]

**阈值阵列 (Gates)**
```json
[
  {
    "check_id": "diameter",
    "label": "直径允许偏差",
    "threshold": { "value": 0.02, "operator": "lte", "unit": "%" },
    "severity": "mandatory",
    "explain": "实际直径与设计值偏差不超过2%"
  },
  {
    "check_id": "spacing",
    "label": "钢筋间距偏差",
    "threshold": { "value": 10, "operator": "lte", "unit": "mm" },
    "severity": "mandatory"
  },
  {
    "check_id": "protection_layer",
    "label": "保护层厚度",
    "threshold": { "value": 5, "operator": "lte", "unit": "mm" },
    "severity": "mandatory"
  }
]
```

**判定逻辑 (verdict_logic)**

输入：`{ actual_values: { diameter: 19.8, spacing: 152 }, design_values: { diameter: 20.0, spacing: 150 } }`  
输出：`{ result: "PASS" | "FAIL" | "WARNING", failed_gates: [], explain: string, proof_hash: string }`

**输出 Schema**
```json
{
  "result": "PASS",
  "failed_gates": [],
  "explain": "所有检查项均满足规范要求",
  "proof_hash": "PF-XXXX...",
  "sealed_at": "2026-04-03T13:08:00Z"
}
```
