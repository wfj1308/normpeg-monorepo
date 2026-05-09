# pdf-parser-api

独立 PDF 解析微服务，支持异步任务、进度查询与 OCR fallback。

## 启动

```bash
cd pdf-parser-api
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload
```

## API

1. `POST /v1/pdf/parse`
   - form-data:
     - `file`: PDF
     - `standardCode`: 标准编号
     - `options`: JSON 字符串，例如：
       - `{"extractTables":true,"extractFormulas":true,"ocrLanguage":"chi_sim+eng"}`
   - 返回：
     - `{"parseId":"parse_xxx","status":"queued"}`

2. `GET /v1/pdf/status/{parseId}`
   - 返回：
     - `{"parseId":"...","status":"queued|processing|success|failed","progress":0.42,"error":null}`

3. `GET /v1/pdf/result/{parseId}`
   - `success` 时返回完整解析结果
   - 非 `success` 时返回当前任务状态

4. `POST /v1/pdf/validate`
   - body:
     - `{"extractedData": {...}, "targetSchema": "SPU-v1"}`

## 说明

- 每页先尝试 `page.get_text()`。
- 当页面文本长度较短（<50）时自动触发 OCR fallback。
- OCR 异常时会回退到原始文本，不会中断整份文档解析。
