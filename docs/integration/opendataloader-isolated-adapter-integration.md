# OpenDataLoader 隔离接入说明（不混入业务逻辑）

## 1. 目标

将 OpenDataLoader 接入现有项目，同时满足：

1. 与 `lab-api` 业务逻辑彻底隔离。
2. 与 `lab-web` 页面业务逻辑彻底隔离。
3. 只通过配置切换，不改业务流程代码。

## 2. 架构

```text
lab-web --------\
                 > table-engine-adapter(:8011) -> OpenDataLoader
lab-api --------/
```

说明：

1. `lab-api` 继续调用 `TABLE_ENGINE_BASE`。
2. `lab-web` 继续调用 `VITE_TABLE_API_BASE`。
3. 两者都指向新服务 `table-engine-adapter`，不直接耦合 OpenDataLoader。

## 3. 新增独立服务

路径：`services/table-engine-adapter`

接口保持现有形状：

1. `GET /api/v1/capabilities`
2. `POST /api/v1/physical-to-logical`
3. `GET /api/v1/latest-schema`

## 4. 接入步骤（零业务代码改造）

### 4.1 启动适配器

```bash
cd services/table-engine-adapter
pip install -e .
python -m uvicorn app.main:app --reload --port 8011
```

### 4.2 配置环境变量

- `lab-api`：
  - `TABLE_ENGINE_BASE=http://127.0.0.1:8011`
- `lab-web`：
  - `VITE_TABLE_API_BASE=http://127.0.0.1:8011`

### 4.3 验证

1. 调用 `GET http://127.0.0.1:8011/healthz` 返回 `{ok:true}`。
2. 在“同版式还原”页面上传文件，确认可出表格结构。
3. 在 `lab-api` 的 `/documents/{id}/table-instances` 验证链路可用。

## 5. 回滚方案

若适配器异常：

1. 将 `TABLE_ENGINE_BASE` 与 `VITE_TABLE_API_BASE` 改回旧引擎地址。
2. 重启 `lab-api` 与 `lab-web`。
3. 业务流程不受代码层改动影响。

## 6. 责任边界

1. `table-engine-adapter`：只做解析适配，不做业务判定。
2. `lab-api`：继续负责业务规则、门禁、台账、流程。
3. `lab-web`：继续负责页面交互，不嵌入解析逻辑。

