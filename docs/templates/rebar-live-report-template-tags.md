# Rebar Live Report Template Tags

## Required Base Variables

- `{{ construction_unit }}`
- `{{ project_name }}`
- `{{ project_uri }}`
- `{{ contract_no }}`
- `{{ stake_range }}`
- `{{ check_date }}`
- `{{ inspector }}`
- `{{ tech_leader }}`
- `{{ generated_at }}`
- `{{ total_count }}`
- `{{ pass_count }}`
- `{{ fail_count }}`
- `{{ summary_result_cn }}`

## Sovereignty Variables

- `{{ proof_id }}`
- `{{ proof_hash }}`
- `{{ gitpeg_anchor }}`
- `{{ v_uri }}`
- `{{ segment_uri }}`
- `{{ executor_uri }}`
- `{{ signed_by }}`
- `{{ ordosign_hash }}`
- `{{ signed_at }}`
- `{{ norm_ref }}`
- `{{ verify_uri }}`
- `{{ qr_image }}`

## Inspection Item Variables

- `{{ items.main_rebar.limit }}`
- `{{ items.main_rebar.design }}`
- `{{ items.main_rebar.val_str }}`
- `{{ items.main_rebar.result_cn }}`
- `{{ items.main_rebar_multi.limit }}`
- `{{ items.main_rebar_multi.design }}`
- `{{ items.main_rebar_multi.val_str }}`
- `{{ items.main_rebar_multi.result_cn }}`
- `{{ items.frame_size.limit }}`
- `{{ items.frame_size.design }}`
- `{{ items.frame_size.val_str }}`
- `{{ items.frame_size.result_cn }}`
- `{{ items.cover_thickness.limit }}`
- `{{ items.cover_thickness.design }}`
- `{{ items.cover_thickness.val_str }}`
- `{{ items.cover_thickness.result_cn }}`

## ProofUTXO Mock Case

Implemented in `services/api/docx_engine.py` as `build_rebar_live_mock_case()`.
