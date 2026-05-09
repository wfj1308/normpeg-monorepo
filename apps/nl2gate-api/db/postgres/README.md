# PostgreSQL Migration Baseline (NormRef Ingest)

## 1) 目标
把当前以 JSON 文件为主的持久化，迁移为 PostgreSQL 主存储，优先覆盖：
- 人工校验（asset reviews）
- pipeline audit / 发布状态
- unresolved queue
- artifacts 索引与摘要

## 2) 初始化
在 PostgreSQL 中执行：

```bash
psql "$PG_DSN" -f apps/nl2gate-api/db/postgres/001_init_normref.sql
```

示例：

```bash
set PG_DSN=postgresql://postgres:postgres@127.0.0.1:5432/normref
psql "%PG_DSN%" -f apps/nl2gate-api/db/postgres/001_init_normref.sql
```

## 3) 建议环境变量
后端新增（或预留）：

- `NORMREF_DB_BACKEND=postgres`
- `NORMREF_PG_DSN=postgresql://user:pass@host:5432/dbname`

兼容策略：
- `json`：沿用当前文件模式
- `postgres`：优先写 PG，可选双写文件作为回滚兜底

## 4) 分阶段接入顺序
1. `POST /normref/ingest/assets/review`  
   - 写 `asset_reviews`
   - 刷新/读取 `asset_review_latest` 用于前端“当前结论”
2. `12_pipeline_audit.json` 相关逻辑  
   - 同步写 `pipeline_audits`
   - 同步写 `ingest_artifacts`（按 job_id + artifact_name upsert）
3. unresolved 相关接口  
   - 切到 `unresolved_rule_queue`
4. 发布流程  
   - 写 `publish_runs`
5. artifact 索引  
   - 把 `00_pipeline_index.json` 摘要落 `ingest_artifacts`

## 5) 前端现有功能与 PG 字段映射
- “已确认通过项数” -> `asset_review_latest.decision='approve'`
- “当前结论” -> `asset_review_latest.decision`
- “仅未提交” -> 在资产全集中不存在 latest 记录
- “仅未闭环项” -> 前端算法 + 可结合 unresolved queue

## 6) 运维建议
- 对 `asset_reviews` 按 `reviewed_at` 做分区（数据量大时）
- 定期 `REFRESH MATERIALIZED VIEW CONCURRENTLY asset_review_latest;`
- 对 `payload JSONB` 仅保留必要字段，原始大文本继续放 artifacts 文件（降成本）
