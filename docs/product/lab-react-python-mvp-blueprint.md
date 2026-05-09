# 瀹為獙瀹よ祫鏂欑郴缁?MVP 钃濆浘锛圧eact + TypeScript + Tailwind + Python锛?
## 1. 涓绘祦绋嬶紙鐢ㄦ埛蹇冩櫤锛?
`璧勬枡鎺ユ敹 -> 缁撴瀯鍖栬瘑鍒?-> 瀹℃牳鎵瑰 -> 璇曢獙鎵ц -> 鎶ュ憡褰掓。 -> NormRef 闂ㄧ鍒ゅ畾`

## 2. 椤甸潰缁撴瀯锛? 鏉′富娴佺▼ + 6 涓富椤甸潰锛?
### 2.1 瀹為獙瀹ゆ€昏 `/lab/dashboard`
- 鍗＄墖锛氬緟澶勭悊璧勬枡銆佸嵆灏嗗埌鏈熻瘉涔︺€佷笉鍚堟牸鎶ュ憡銆侀棬绂侀樆鏂伐搴忋€佽繎 7 澶╅€氳繃鐜囥€?- 鍥捐〃锛氭寜 8 绫荤洰褰曠殑澶勭悊閲忚秼鍔裤€侀€氳繃/闃绘柇鍗犳瘮銆?
### 2.2 璧勬枡涓績 `/lab/documents`
- 缁熶竴涓婁紶鍏ュ彛锛堟敮鎸?8 绫昏嚜鍔ㄥ綊妗ｏ級銆?- 鍒楄〃绛涢€夛細椤圭洰銆佹爣娈点€佺洰褰曠被鍨嬨€佹棩鏈熴€佺姸鎬併€佺粨璁恒€?- 璇︽儏涓夋爮锛氬師濮嬫枃浠?/ 缁撴瀯鍖栧瓧娈?/ 瑙勫垯鍒ゅ畾缁撴灉銆?
### 2.3 瀹℃壒涓庢壒澶嶄腑蹇?`/lab/approvals`
- 瀵硅薄锛氭潗鏂欏叆鍥淬€佹枡婧愭壒澶嶃€侀厤鍚堟瘮鎵瑰銆?- 鐘舵€佹祦锛歚pending -> approved/rejected -> expired`銆?
### 2.4 璇曢獙浠诲姟涓績 `/lab/experiments`
- 瀵硅薄锛氭爣鍑嗗嚮瀹炪€佸師鏉愭枡銆侀挗绛嬭繛鎺ャ€佽矾闈㈤厤鍚堟瘮銆?- 瀛愭ā鍧楋細濮旀墭鍗曘€佹牱鍝併€佹娴嬭褰曘€佺粨璁虹鍙戙€?
### 2.5 鎶ュ憡涓庤瘉涔﹀簱 `/lab/reports`
- 璇佷功/鎶ュ憡鍏ㄦ枃銆佺増鏈€佺绔犮€佹湁鏁堟湡銆?- 鍏宠仈閾捐矾锛氳祫鏂?-> 宸ョ▼鐐逛綅 -> 瑙勫垯 -> Proof銆?
### 2.6 瑙勫垯涓庨棬绂侊紙NormRef锛塦/lab/normref-gate`
- 鏄剧ず鍛戒腑瑙勫垯銆侀樆鏂師鍥犮€佷慨澶嶅缓璁€?- 缁熶竴鐘舵€佽壊锛歚pass(缁? / risk(榛? / block(绾? / missing(鐏?`銆?
## 3. 8 绫昏祫鏂欏埌涓氬姟瀵硅薄鏄犲皠

| 鐩綍 | 涓氬姟瀵硅薄 | 涓婚〉闈?|
|---|---|---|
| 鏍囧畾璇佷功 | `instrument` | 鎶ュ憡涓庤瘉涔﹀簱 |
| 鏉愭枡鍏ュ洿 | `supplier_admission` | 瀹℃壒涓庢壒澶嶄腑蹇?|
| 鏍囧噯鍑诲疄 | `standard_compaction` | 璇曢獙浠诲姟涓績 |
| 鏉愭枡鏂欐簮鎵瑰 | `material_source_approval` | 瀹℃壒涓庢壒澶嶄腑蹇?|
| 閰嶅悎姣旀壒澶?| `mix_ratio_approval` | 瀹℃壒涓庢壒澶嶄腑蹇?|
| 鍘熸潗鏂?| `raw_material_batch` | 璇曢獙浠诲姟涓績 |
| 閽㈢瓔杩炴帴 | `rebar_connection` | 璇曢獙浠诲姟涓績 |
| 璺潰閰嶅悎姣?| `pavement_mix_ratio` | 璇曢獙浠诲姟涓績 |

## 4. 缁熶竴璧勬枡鍙拌处涓婚敭锛圡VP锛?
- `report_no`锛堟姤鍛婄紪鍙凤級
- `specimen_no`锛堟牱鍝佺紪鍙凤級
- `batch_no`锛堟壒娆★級
- `material_code`锛堟潗鏂欑紪鐮侊級
- `experiment_date`锛堣瘯楠屾棩鏈燂級
- `conclusion`锛堢粨璁猴級
- `valid_until`锛堟湁鏁堟湡锛?
## 5. 鍓嶇鎶€鏈疄鐜板缓璁紙React + TS + Tailwind锛?
## 5.1 鐩綍缁撴瀯

```text
src/
  pages/lab/
    DashboardPage.tsx
    DocumentsPage.tsx
    ApprovalsPage.tsx
    ExperimentsPage.tsx
    ReportsPage.tsx
    NormRefGatePage.tsx
  components/lab/
    StatusBadge.tsx
    LedgerPanel.tsx
    GateResultPanel.tsx
    DocumentViewer.tsx
  services/
    labApi.ts
    normrefApi.ts
  store/
    labStore.ts
```

## 5.2 鐘舵€佺鐞?
- `TanStack Query`锛氭湇鍔＄鏁版嵁缂撳瓨涓庤姹傜姸鎬併€?- `Zustand`锛氭湰鍦?UI 鐘舵€侊紙绛涢€夋潯浠躲€佸彸渚ц鎯呴潰鏉跨姸鎬侊級銆?
## 6. 鍚庣鎶€鏈疄鐜板缓璁紙Python锛?
## 6.1 FastAPI 妯″潡鍒嗗眰

```text
services/api/
  routers/lab_documents.py
  routers/lab_approvals.py
  routers/lab_experiments.py
  routers/lab_gate.py
  domain/lab/
    ingest_service.py
    ledger_service.py
    gate_service.py
```

## 6.2 涓庡綋鍓嶈В鏋愬櫒瀵规帴

- 鐜版湁 `tools/normpeg/normref_ingest_batch.py` 鐢ㄤ簬鎵归噺瑙ｆ瀽銆?- 鐜版湁 `runtime/normref_ingest.py` 鐢ㄤ簬瑙勫垯鍊欓€夌敓鎴?鍙戝竷銆?- 鏂版帴鍙ｇ洿鎺ヨ鍙?ingest report锛屼緵鍓嶇灞曠ず鍙拌处涓庨棬绂侀妫€銆?
## 7. API 瀵规帴琛紙MVP锛?
| 鑳藉姏 | 鏂规硶 | 璺緞 | 璇存槑 |
|---|---|---|---|
| 涓婁紶璧勬枡 | POST | `/api/v1/lab/documents/upload` | 鍘熸枃浠朵笂浼?+ hash + 鐩綍绫诲瀷 |
| 瑙﹀彂瑙ｆ瀽 | POST | `/api/v1/lab/documents/{id}/ingest` | 璋冪敤 NormRef ingest |
| 鍙拌处鍒楄〃 | GET | `/api/v1/lab/documents` | 鏀寔澶氭潯浠剁瓫閫?|
| 鍙拌处璇︽儏 | GET | `/api/v1/lab/documents/{id}` | 鍘熶欢 + 缁撴瀯鍖栧瓧娈?+ gate |
| 瀹℃壒鎻愪氦 | POST | `/api/v1/lab/approvals/{id}/submit` | 鍏ュ洿/鏂欐簮/閰嶅悎姣斿鎵?|
| 璇曢獙璁板綍鎻愪氦 | POST | `/api/v1/lab/experiments/{id}/submit` | 鍘熸潗鏂?閽㈢瓔杩炴帴/鍑诲疄绛?|
| 闂ㄧ鍒ゅ畾 | POST | `/api/v1/lab/gate/evaluate` | 璋?NormRef 鏍￠獙骞惰繑鍥為樆鏂師鍥?|

## 8. Gate 鏈€灏忚鍒欙紙鍏堣惤鍦拌繖 4 鏉★級

1. 浠櫒鏄惁鍦ㄦ瀹氭湁鏁堟湡鍐呫€? 
2. 閰嶅悎姣旀槸鍚﹀凡鎵瑰涓旂増鏈尮閰嶃€? 
3. 鍘熸潗鏂?閽㈢瓔杩炴帴鎶ュ憡鏄惁鍚堟牸銆? 
4. 妫€娴嬫棩鏈熸槸鍚﹀湪鏈夋晥绐楀彛鍐呫€? 

## 9. 涓ゅ懆 MVP 鑺傚

### 绗?1 鍛?- 涓婄嚎锛氭€昏銆佽祫鏂欎腑蹇冦€佽瘯楠屼换鍔′腑蹇冦€?- 鎵撻€氾細涓婁紶 -> 瑙ｆ瀽 -> 浜哄 -> 鐘舵€佸睍绀恒€?
### 绗?2 鍛?- 涓婄嚎锛氬鎵逛笌鎵瑰涓績銆佹姤鍛婂簱銆丯ormRef 闂ㄧ椤点€?- 鎵撻€氾細瑙勫垯闃绘柇 -> 淇寤鸿 -> 鏀捐闂幆銆?

