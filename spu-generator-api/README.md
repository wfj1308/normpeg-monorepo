# spu-generator-api

独立 SPU 生成微服务（NormBot 核心），输入 `extractedData`，输出 `spu + markdown + json + specbundle`。

## 目录结构

```text
spu-generator-api/
├── app/
│   ├── main.py
│   ├── routes/spu.py
│   ├── services/spu_generator.py
│   ├── services/markdown_renderer.py
│   ├── services/json_renderer.py
│   ├── services/specbundle_builder.py
│   ├── services/validator.py
│   ├── models/schemas.py
│   └── storage/output_store.py
├── requirements.txt
└── README.md
```

## 启动

```bash
cd spu-generator-api
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8020 --reload
```

## API

1. `POST /v1/spu/generate`
2. `GET /v1/spu/result/{taskId}`
3. `GET /v1/spu/download/{taskId}.specbundle`
4. `POST /v1/spu/validate`

## 当前支持范围（v1）

- 支持：路基压实度（`highway.subgrade.compaction.4.2.1.soil@v1`）
- 不支持指标返回：`UNSUPPORTED_METRIC`

