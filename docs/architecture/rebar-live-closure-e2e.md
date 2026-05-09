# Rebar 活表闭环验收

## 脚本路径

- `tools/acceptance/rebar_live_closure_e2e.py`

## 作用范围

- 前端录入字段对应的后端入参：`design/limit/values`
- 后端自动判定：`result_source`
- Proof UTXO 主权字段：`ordosign_hash/executor_uri/proof_hash/gitpeg_anchor/v_uri/project_uri/segment_uri`
- 报告触发与主权校验：`/v1/reports/generate` + `/v1/proof/utxo/{proof_id}` + `/v1/proof/verify/{proof_id}`

## 运行命令

```bash
python tools/acceptance/rebar_live_closure_e2e.py \
  --api-base http://localhost:8000 \
  --email admin@zhongbei.com \
  --password 123456 \
  --project-id 33333333-3333-4333-8333-333333333333
```

可选强校验报告文件 URL：

```bash
python tools/acceptance/rebar_live_closure_e2e.py \
  --api-base http://localhost:8000 \
  --email admin@zhongbei.com \
  --password 123456 \
  --project-id 33333333-3333-4333-8333-333333333333 \
  --require-file
```

## 成功标志

- 输出包含 `[DONE] rebar live-table closure e2e passed`
- 输出包含 `[SUMMARY] ...`，可见 inspection/report 的 `proof_id`
