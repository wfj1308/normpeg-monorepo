# NormRef 演示环境变量与启动

## 1) 最小可运行（推荐）

PowerShell:

```powershell
$env:NORMREF_REQUIRE_AUTH_V1="1"
$env:NORMREF_BEARER_TOKEN="demo-token"
$env:NORMREF_PROVIDER_FALLBACK="1"

# 可选：让 /api/v1 也强制鉴权
# $env:NORMREF_REQUIRE_AUTH_API_V1="1"
```

说明:
- `/v1/*` 默认强制 `Authorization: Bearer <token>`
- 未设置 `NORMREF_BEARER_TOKEN` 时，接口会返回 `AUTH_CONFIG_MISSING`（503）
- `NORMREF_PROVIDER_FALLBACK=1` 时，provider 失败会自动回退 mock

开发临时放开（不推荐生产）:

```powershell
$env:NORMREF_ALLOW_ANY_BEARER="1"
```

## 2) Provider 接入（可选）

```powershell
# PDF
$env:NORMREF_PDF_PROVIDER="http"
$env:NORMREF_PDF_PROVIDER_URL="https://your-pdf-provider/parse"

# Image OCR
$env:NORMREF_IMAGE_PROVIDER="http"
$env:NORMREF_IMAGE_PROVIDER_URL="https://your-image-provider/recognize"

# Voice ASR
$env:NORMREF_VOICE_PROVIDER="http"
$env:NORMREF_VOICE_PROVIDER_URL="https://your-voice-provider/transcribe"

# 可选超时（秒，默认 8）
$env:NORMREF_PROVIDER_TIMEOUT_SECONDS="8"

# 可选：严格按 compaction 物理公式计算（默认关闭，默认是演示校准）
$env:NORMREF_STRICT_COMPACTION_FORMULA="1"
```

严格模式（provider 异常直接报错，不回退）:

```powershell
$env:NORMREF_PROVIDER_FALLBACK="0"
```

## 3) 启动服务

在 `normpeg-monorepo` 根目录:

```powershell
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

## 4) 6 个 API 串联示例

```powershell
$token = "demo-token"
$base = "http://127.0.0.1:8000"

# 1) PDF parse
curl.exe -X POST "$base/v1/pdf/parse" `
  -H "Authorization: Bearer $token" `
  -F "file=@JTG_F80_1_2017.pdf" `
  -F "standardCode=JTG F80/1-2017" `
  -F "options={""extractTables"":true,""extractFormulas"":true}"

# 2) SPU generate
curl.exe -X POST "$base/v1/spu/generate" `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d "{""parseId"":""parse_xxx"",""clauseId"":""4.2.1"",""standardCode"":""JTG F80/1-2017"",""options"":{""includeForm"":true,""includePath"":true,""includeGate"":true}}"

# 3) Gate evaluate
curl.exe -X POST "$base/v1/gate/evaluate" `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d "{""spuId"":""highway.subgrade.compaction.4.2.1.soil@v1"",""inputs"":{""massHoleSand"":2850.5,""volumeSand"":2000,""moistureContent"":8.5,""maxDryDensity"":2.35},""context"":{""projectId"":""dajin-2024"",""layerZone"":""96区""}}"

# 4) State transition
curl.exe -X POST "$base/v1/state/transition" `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d "{""vuri"":""v:/cn.highway/dajin/subgrade/DB-01/K15+200"",""spuId"":""highway.subgrade.compaction.4.2.1.soil@v1"",""fromState"":""COMPUTED"",""toState"":""VALIDATED"",""triggeredBy"":""did:peg:ins_001"",""signatures"":{""lab"":""0xsign123""}}"

# 5) Proof verify
curl.exe -X POST "$base/v1/proof/verify" `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d "{""proofHash"":""0xyour-proof-hash"",""verifyOptions"":{""includeTrace"":true,""verifySignatures"":true,""checkAnchor"":true}}"

# 6) Mapping resolve
curl.exe -X POST "$base/v1/mapping/resolve" `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d "{""vuri"":""v:/cn.highway/dajin/subgrade/DB-01/K15+200"",""context"":{""layer"":""96区"",""time"":""2026-04-17T10:00:00Z""}}"
```
