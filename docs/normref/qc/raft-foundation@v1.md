# v://normref.com/qc/raft-foundation@v1

**元数据 (Anchor)**
- norm_code: GB50204-2015 + JTG F80/1-2017
- boq_item_id: 403-raft-foundation
- description: 筏基础施工质检协议块
- ref_spu_uri: v://normref.com/spu/raft-foundation@v1

**阈值阵列 (Gates)**
```json
[
  {
    "check_id": "raft_thickness",
    "label": "厚度偏差",
    "threshold": { "value": 10, "operator": "lte", "unit": "mm" },
    "severity": "mandatory"
  },
  {
    "check_id": "concrete_strength",
    "label": "混凝土强度",
    "threshold": { "value": 30, "operator": "gte", "unit": "MPa" },
    "severity": "mandatory"
  },
  {
    "check_id": "rebar_spacing",
    "label": "钢筋间距偏差",
    "threshold": { "value": 10, "operator": "lte", "unit": "mm" },
    "severity": "mandatory"
  }
]
```

**判定逻辑 (verdict_logic)**
- mandatory gate 全部 PASS => PASS
- 任一 mandatory gate FAIL => FAIL

**输出 Schema**
```json
{
  "result": "PASS|FAIL|WARNING",
  "failed_gates": [],
  "explain": "",
  "proof_hash": "",
  "sealed_at": "ISO-8601"
}
```
