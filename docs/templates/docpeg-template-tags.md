# DocPeg Template Tags

## Common Sovereignty Fields

- `{{ v_uri }}`
- `{{ project_uri }}`
- `{{ segment_uri }}`
- `{{ proof_hash }}`
- `{{ proof_id }}`
- `{{ gitpeg_anchor }}`
- `{{ signed_by }}`
- `{{ executor_uri }}`
- `{{ ordosign_hash }}`
- `{{ signed_at }}`
- `{{ norm_ref }}`
- `{{ qr_image }}`

## Common Business Fields

- `{{ construction_unit }}`
- `{{ project_name }}`
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

## Record List Loop

```jinja2
{% for r in records %}
{{ r.index }} | {{ r.type_name }} | {{ r.location }} | {{ r.design }} | {{ r.limit }} | {{ r.val_str }} | {{ r.result_cn }}
{% endfor %}
```

## Hierarchy Summary Loop (11.docx)

```jinja2
{% for h in hierarchy_summary_rows %}
{{ h.depth }} | {{ h.code }} | {{ h.node_type }} | {{ h.item_name }} | {{ h.settled_quantity }} / {{ h.design_quantity }} | {{ h.progress_percent }}%
{% endfor %}
```

- `{{ hierarchy_root_hash }}`
- `{{ hierarchy_filtered_root_hash }}`
- `{{ hierarchy_filter.anchor_code }}`
- `{{ hierarchy_filter.direction }}`
- `{{ hierarchy_filter.level }}`
- `{{ hierarchy_filter.filtered_row_count }}`
- `{{ chapter_progress.chapter_code }}`
- `{{ chapter_progress.progress_percent }}`
- `{{ chapter_progress.settled_quantity }}`
- `{{ chapter_progress.design_quantity }}`

## Gate Binding Fields (12.docx)

- `{{ linked_gate_id }}`
- `{{ linked_spec_uri }}`
- `{{ gate_template_lock }}`
- `{{ qc_gate_status }}`
- `{{ qc_gate_result_hash }}`

## Inspection Template Fixed Items

- `{{ items.main_rebar.* }}`
- `{{ items.main_rebar_multi.* }}`
- `{{ items.frame_size.* }}`
- `{{ items.cover_thickness.* }}`

## Template Routing

- `inspection` -> `01_inspection_report.docx`
- `lab` -> `02_lab_report.docx`
- `monthly_summary` -> `03_monthly_summary.docx`
- `final_archive` -> `04_final_archive_cover.docx`

## Export API

- `POST /v1/reports/export`
- request supports `type` and `format` (`docx`/`pdf`)
- when `format=pdf` and local `soffice` is unavailable, backend falls back to `docx` and returns `output_format=docx`
