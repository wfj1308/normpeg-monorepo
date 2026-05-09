# NormPeg + BOQ + DocPeg Workflow

This workflow implements:

1. `BOQ -> UTXO` genesis initialization
2. `NormPeg` context-aware threshold routing
3. `TripRole` lifecycle transition (`quality.check -> measure.record -> settlement.confirm`)
4. `DocPeg` proof-chain rendering
5. DSP `.zip` packaging (`pdf + provenance_chain.json + fingerprint + evidence`)

## 1) BOQ Import and UTXO Initialization

Script: `tools/normpeg/boq_to_utxo_init.py`

```bash
python tools/normpeg/boq_to_utxo_init.py \
  --xlsx "C:/Users/xm_91/Desktop/400章(1).xlsx" \
  --project-uri "v://project/highway/JK-C08/" \
  --project-id "<project_uuid>"
```

Persist to `proof_utxo`:

```bash
python tools/normpeg/boq_to_utxo_init.py \
  --xlsx "C:/Users/xm_91/Desktop/400章(1).xlsx" \
  --project-uri "v://project/highway/JK-C08/" \
  --project-id "<project_uuid>" \
  --commit
```

Each BOQ row creates a deterministic INITIAL UTXO payload:

- `state_data.status = "INITIAL"`
- `state_data.boq_item_uri = v://project/boq/<item_no>`
- `state_data.norm_context_uri = v://project/normContext/<item_no>`
- `state_data.genesis_hash = sha256(canonical_boq_payload)`
- includes `design_quantity` and optional `unit_price`

11.docx hierarchical upgrade:

- parser function: `parse_boq_hierarchy(excel_file)` builds `chapter -> section -> item -> detail` tree.
- importer now creates both parent/group nodes and leaf nodes in `proof_utxo`.
- every node carries `hierarchy_tree.parent_utxo` and `hierarchy_tree.children[]/children_utxo[]`.
- leaf-only metrics: only `is_leaf=true` nodes keep ledger fields (`design_quantity`, `approved_quantity`, balance).
- parent node integrity: `hierarchy_tree.children_merkle_root` + `subtree_hash` are embedded in state so parent `proof_hash` seals descendants.

## 2) NormPeg Dynamic Routing

Core module: `services/api/normpeg_engine.py`

Core function:

- `NormPegEngine.get_threshold(spec_uri, context)`
- `resolve_norm_rule(spec_uri, context)` (public context-routing API)

Supported URI format:

- `v://norm/GB50204/5.3.2#diameter_tolerance`
- `v://norm/GB50204@2015/5.3.2#diameter_tolerance`

Context routing behavior:

- `main_beam` -> `[-1, 1] mm`
- `guardrail` -> `[-5, 5] mm`
- fallback -> default range

Inspection runtime integration:

- `services/api/inspections_create_utils.py::compute_spec_eval_pack`
- tries NormPeg first; falls back to existing SpecIR rules when no NormPeg match.

## 3) TripRole Lifecycle + Gate Locking

Core service: `services/api/triprole_engine.py`

- `execute_triprole_action(...)`
- `aggregate_provenance_chain(utxo_id, sb)`
- `build_docfinal_package_for_boq(...)`

TripRole actions:

- `sensor.ingest` (`POST /triprole/hardware/ingest`): BLE/IoT 量具原始报文直采，生成 PRECHECK Proof 并绑定设备 SN/检定有效期
- `quality.check`: consume INITIAL UTXO -> create ENTRY UTXO
- `measure.record`: consume ENTRY/VARIATION UTXO -> create INSTALLATION UTXO
- `variation.record`: consume FAIL UTXO -> create VARIATION compensation UTXO; when payload carries `delta_amount`, it also merges ledger delta
- `settlement.confirm`: consume INSTALLATION/VARIATION UTXO -> create SETTLEMENT(final) UTXO，并强制校验多方 `signer_metadata` 生物识别状态
- all TripRole writes require `geo_location` + `server_timestamp_proof` for spatiotemporal anchoring
- `measure.record` 会执行 Geo-Fence 合规检查：围栏外写入默认标记 `trust_level=LOW` + `geo_fence_warning`（strict_mode 可配置为直接拦截）

`quality.check` NormPeg auto-judge payload example:

```json
{
  "action": "quality.check",
  "input_proof_id": "GP-BOQ-XXXX",
  "executor_uri": "v://user/qc/inspector01",
  "geo_location": {
    "lat": 30.5728,
    "lng": 104.0668,
    "captured_at": "2026-03-28T10:30:00+08:00"
  },
  "server_timestamp_proof": {
    "ntp_server": "ntp.aliyun.com",
    "client_timestamp": "2026-03-28T10:30:00+08:00",
    "ntp_offset_ms": 12.3
  },
  "payload": {
    "spec_uri": "v://norm/GB50204/5.3.2#diameter_tolerance",
    "context": "main_beam",
    "design": 20.0,
    "value": 19.8
  }
}
```

Settlement lock policy:

- any ancestry node with `result=FAIL` blocks `settlement.confirm`
- only `variation.record` compensation (`compensates`) can unlock settlement

API endpoints:

- `POST /v1/proof/triprole/execute`
- `POST /v1/proof/triprole/apply-variation`
- `POST /v1/proof/triprole/offline/replay`
- `POST /v1/proof/triprole/scan-confirm`
- `POST /v1/proof/triprole/hardware/ingest`
- `GET /v1/proof/triprole/provenance/{utxo_id}`
- `GET /v1/proof/triprole/aggregate-chain/{utxo_id}` (alias)
- `GET /v1/proof/unit/merkle-root?project_uri=...&proof_id=...`
- `GET /v1/proof/docfinal/context?boq_item_uri=...`
- `GET /v1/proof/docfinal/download?boq_item_uri=...`

Protocol upgrades:

- `Shadow Ledger Mirroring`: configure `enterprise_configs.custom_fields.shadow_mirror_targets` to push encrypted proof packets to supervisor/owner mirrors.
- `DID Gate`: for BOQ chapter `403-*`, TripRole actions enforce `rebar_special_operator` credential before state transition.
- `Sovereign Credit`: each qualified DID accumulates score from historical NormPeg deviations; endorsement is embedded in DocPeg context (`credit_endorsement`).
- `Hardware-Based Evidence`: sensor ingest records `sensor_hardware.device_sn + calibration_valid_until + sensor_payload_hash`, reducing manual input.
- `Biometric DID Binding`: settlement consensus requires per-signer biometric pass + timestamp (`signer_metadata`), otherwise transaction rejected.
- `Geo-Fencing`: project boundary from `enterprise_configs.custom_fields.(project_site_boundaries|site_boundary|geo_fence)`; out-of-fence proof carries explicit low-trust warning.

`apply-variation` payload example:

```json
{
  "boq_item_uri": "v://project/boq/403-1-2",
  "delta_amount": 18.5,
  "reason": "design variation V-2026-031",
  "executor_uri": "v://user/triprole/variation-manager",
  "geo_location": {
    "lat": 30.5728,
    "lng": 104.0668,
    "captured_at": "2026-03-28T10:32:00+08:00"
  },
  "server_timestamp_proof": {
    "ntp_server": "ntp.aliyun.com",
    "client_timestamp": "2026-03-28T10:32:00+08:00",
    "ntp_offset_ms": 10.0
  }
}
```

`offline/replay` payload example:

```json
{
  "stop_on_error": false,
  "packets": [
    {
      "offline_packet_id": "offline-20260328-0001",
      "packet_type": "triprole.execute",
      "action": "quality.check",
      "input_proof_id": "GP-...",
      "executor_uri": "v://user/triprole/device-1",
      "executor_role": "TRIPROLE",
      "payload": {
        "spec_uri": "v://norm/cn-jtg/bridge/rebar/cover-thickness",
        "design": 20.0,
        "value": 19.8
      },
      "geo_location": {
        "lat": 30.5728,
        "lng": 104.0668,
        "captured_at": "2026-03-28T10:32:00+08:00"
      },
      "server_timestamp_proof": {
        "ntp_server": "ntp.aliyun.com",
        "client_timestamp": "2026-03-28T10:32:00+08:00",
        "ntp_offset_ms": 10.0
      }
    }
  ]
}
```

`scan-confirm` payload example:

```json
{
  "input_proof_id": "GP-...",
  "scan_payload": "<base64url-token-from-docpeg-qr>",
  "scanner_did": "did:coordos:supervisor:zhangsan",
  "scanner_role": "supervisor",
  "geo_location": {
    "lat": 30.5728,
    "lng": 104.0668,
    "captured_at": "2026-03-28T11:08:00+08:00"
  },
  "server_timestamp_proof": {
    "ntp_server": "ntp.aliyun.com",
    "client_timestamp": "2026-03-28T11:08:00+08:00",
    "ntp_offset_ms": 6.0
  }
}
```

`hardware/ingest` payload example:

```json
{
  "device_id": "ble-caliper-01",
  "boq_item_uri": "v://project/boq/403-1-2",
  "project_uri": "v://project/highway/JK-C08/",
  "executor_uri": "v://user/triprole/inspector01",
  "executor_did": "did:coordos:worker:li-001",
  "geo_location": {
    "lat": 30.5728,
    "lng": 104.0668,
    "captured_at": "2026-03-28T11:20:00+08:00"
  },
  "server_timestamp_proof": {
    "ntp_server": "ntp.aliyun.com",
    "client_timestamp": "2026-03-28T11:20:00+08:00",
    "ntp_offset_ms": 8.0
  },
  "raw_payload": {
    "boq_item_uri": "v://project/boq/403-1-2",
    "value": 0.3,
    "unit": "mm",
    "device_sn": "SN-20260328-7788",
    "calibration_valid_until": "2026-12-31T23:59:59+08:00",
    "transport": "ble"
  }
}
```

`settlement.confirm` biometric metadata snippet:

```json
{
  "action": "settlement.confirm",
  "input_proof_id": "GP-...",
  "consensus_signatures": [
    {"role": "contractor", "did": "did:coordos:c1", "signature_hash": "<sha256>"},
    {"role": "supervisor", "did": "did:coordos:s1", "signature_hash": "<sha256>"},
    {"role": "owner", "did": "did:coordos:o1", "signature_hash": "<sha256>"}
  ],
  "signer_metadata": {
    "signers": [
      {"role": "contractor", "did": "did:coordos:c1", "biometric_passed": true, "verified_at": "2026-03-28T11:25:00+08:00"},
      {"role": "supervisor", "did": "did:coordos:s1", "biometric_passed": true, "verified_at": "2026-03-28T11:25:10+08:00"},
      {"role": "owner", "did": "did:coordos:o1", "biometric_passed": true, "verified_at": "2026-03-28T11:25:20+08:00"}
    ]
  }
}
```

CLI lifecycle demo:

```bash
python tools/normpeg/triprole_lifecycle_demo.py \
  --boq-item-uri "v://project/boq/403-1-2" \
  --executor-uri "v://user/triprole/demo"
```

FAIL + variation compensation path:

```bash
python tools/normpeg/triprole_lifecycle_demo.py \
  --boq-item-uri "v://project/boq/403-1-2" \
  --quality-result FAIL \
  --use-variation
```

## 4) Proof Chain Aggregation + DocPeg Rendering

Core module: `services/api/docpeg_proof_chain_service.py`

- `get_proof_chain(boq_item_uri, sb)`
- `build_rebar_report_context(...)`
- `render_rebar_inspection_docx(...)`
- `render_rebar_inspection_pdf(...)`
- `build_dsp_zip_package(...)`

Recursive hierarchy summary context (11.docx):

- `context.hierarchy_summary_rows`: recursive aggregate rows by chapter/section/item/detail.
- `context.hierarchy_root_hash`: merkle-like root over hierarchy summary tree.
- `context.chapter_progress`: chapter-level aggregated progress snapshot.

CLI example:

```bash
python tools/normpeg/docpeg_chain_report.py \
  --boq-item-uri "v://project/boq/403-1-2" \
  --template "services/api/templates/rebar_inspection_table.docx"
```

## 5) Template Tags (rebar_inspection_table.docx)

Recommended tags:

- `{{ project_name }}`
- `{{ project_uri }}`
- `{{ boq_item_uri }}`
- `{{ generated_at }}`
- `{{ proof_id }}`
- `{{ verify_uri }}`
- `{{ qr_image }}`
- `{{ scan_confirm_uri }}`
- `{{ scan_confirm_qr }}`
- `{{ chain_root_hash }}`
- `{{ total_proof_hash }}`
- `{{ artifact_uri }}`
- `{{ gitpeg_anchor }}`

Timeline tags:

- `{% for node in timeline %}`
- `{{ node.step }}`
- `{{ node.label }}`
- `{{ node.result }}`
- `{{ node.time }}`
- `{{ node.proof_id }}`
- `{% endfor %}`

Table loop tags:

- `{% for row in records %}`
- `{{ row.index }}`
- `{{ row.item_name }}`
- `{{ row.design_value }}`
- `{{ row.measured_value }}`
- `{{ row.deviation_percent }}`
- `{{ row.result }}`
- `{{ row.row_hash }}`
- `{% endfor %}`

Proof chain loop tags:

- `{% for node in proof_chain %}`
- `{{ node.proof_id }}`
- `{{ node.proof_hash }}`
- `{{ node.row_hash }}`
- `{{ node.parent_proof_id }}`
- `{% endfor %}`

## 6) Norm Dictionary SQL

Migration file:

- `infra/supabase/012_normpeg_dictionary.sql`

It creates `norm_entries` table and seeds `v://norm/GB50204@2015/5.3.2` with context-aware `diameter_tolerance`.

## 7) Provenance Chain Requirements

Generated DSP zip includes:

- `provenance_chain.json` (full chain nodes + aggregated `v://` references)
- `proof_chain.json` (raw chain rows)
- `fingerprint.json` (chain root hash + context fingerprint)
- `spatiotemporal_anchor.json` (GPS + NTP timestamp proof anchors and aggregate hash)
- `signature.json` (package signature artifact)
- `report.pdf`
- `evidence/*` + `evidence/manifest.json`

DocFinal PDF fallback footer includes:

- `Total Proof Hash`
- `Artifact URI`
- `GitPeg Anchor`

## 8) BOQ Progress Payment + Sovereign Audit

Payment certificate API:

- `POST /v1/proof/payment/certificate/generate`

Request body:

```json
{
  "project_uri": "v://project/highway/JK-C08/",
  "period": "2026-03",
  "project_name": "JK-C08",
  "create_proof": true
}
```

Core rules:

- only `SETTLEMENT + PASS + consensus signatures (contractor/supervisor/owner)` are billable
- any related `FAIL` in proof chain excludes the BOQ line with warning
- if cumulative settled quantity exceeds genesis quantity, the line is `overrun_locked`

Sovereign audit API:

- `GET /v1/proof/payment/audit-trace/{payment_id}`

Returns a trace graph (`nodes + edges`) supporting:

- `amount -> quantity -> quality -> norm`
- evidence hash/source reference
- signer DID and signature hash records

## 9) Master DSP Final Delivery

Final delivery endpoint:

- `POST /v1/proof/docfinal/finalize`

Adds batch anchor rounds after export and returns:

- `X-DocFinal-Root-Hash`
- `X-DocFinal-Proof-Id`
- `X-DocFinal-GitPeg-Anchor`
- `X-DocFinal-Final-GitPeg-Anchor`
- `X-DocFinal-Anchor-Runs`

## 10) Spatial Twin + AI Governance + Finance

Spatial binding APIs:

- `POST /v1/proof/spatial/bind`
- `GET /v1/proof/spatial/dashboard?project_uri=...`

`spatial/bind` payload example:

```json
{
  "utxo_id": "GP-BOQ-XXXX",
  "project_uri": "v://project/highway/JK-C08/",
  "bim_id": "403-pier",
  "label": "403桥墩",
  "coordinate": {
    "lat": 30.123,
    "lng": 104.123
  }
}
```

AI governance API:

- `POST /v1/proof/ai/predictive-quality`

Core output:

- deviation mean/variance by `boq_item_uri + team + norm`
- early-warning list when trend approaches critical threshold
- optional dynamic gate injection (`role=EXPERT`) into next unspent UTXO

Finance proof API:

- `POST /v1/proof/finance/proof/export`

It exports encrypted bank-facing proof bundle containing:

- payment certificate summary/lines
- lineage snapshots per settlement proof
- GitPeg anchor reference

## 11) RWA Tokenization + Sovereign O&M + Norm Evolution

RWA tokenization API:

- `POST /v1/proof/rwa/convert`

Request body:

```json
{
  "project_uri": "v://project/highway/JK-C08/",
  "boq_group_id": "403",
  "bank_code": "CN-RWA-001",
  "run_anchor_rounds": 1
}
```

Sovereign O&M handover APIs:

- `POST /v1/proof/om/handover/export`
- `POST /v1/proof/om/event/register`

`om/handover/export` creates a persistent `om_root_uri` and returns `om_root_proof_id`.
Subsequent O&M events must set `parent_proof_id = om_root_proof_id` through `/om/event/register`.

Norm evolution feedback API:

- `POST /v1/proof/norm/evolution/report`

Core behavior:

- aggregates deviation distribution by `norm_uri + context_key`
- computes near-threshold share and fail share
- outputs suggestion (`keep / tighten / relax / warning-band`)
- supports anonymized project references for privacy-preserving submission

## 12) Subitem-Gate Binding + Chain Write-back + Multi-dimensional Aggregation

Subitem-Gate binding:

- BOQ initialization now injects:
  - `linked_gate_id`
  - `linked_gate_ids`
  - `linked_gate_rules`
  - `linked_spec_uri`
  - `gate_template_lock`
- Gateway function:
  - `services/api/boq_utxo_service.py::auto_bind_gates(sb, utxo_id)`

TripRole chain write-back:

- `quality.check` now enforces template lock:
  - if `gate_template_lock=true`, manual `spec_uri` override is rejected.
- Gate result is persisted as on-chain state:
  - `qc_gate_result`
  - `qc_gate_status`
  - `qc_gate_result_hash`
  - `qc_gate_history`
- Write-back helper:
  - `services/api/triprole_engine.py::update_chain_with_result(sb, gate_output)`

DocFinal multi-dimensional aggregation:

- `/v1/proof/docfinal/context` and `/v1/proof/docfinal/download` now support:
  - `aggregate_anchor_code`
  - `aggregate_direction` (`all|up|down|both`)
  - `aggregate_level` (`all|chapter|section|item|detail|leaf|group`)
- Context adds:
  - `hierarchy_summary_rows_all`
  - `hierarchy_summary_rows` (filtered)
  - `hierarchy_filter`
  - `hierarchy_filtered_root_hash`

Full aggregation smoke script:

- `python tools/normpeg/docfinal_full_aggregate.py --project-uri <v://...>`
- Output:
  - `DOCFINAL-*.zip`
  - `DOCFINAL-*.context.json` (detail rows + hierarchy summary rows snapshot)
