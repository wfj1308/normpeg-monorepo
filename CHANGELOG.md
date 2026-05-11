# Changelog

## 2026-05-11

### Added
- `knowledge_base/engineering/pile_foundation/` evidence inventory artifacts:
  - `manifest.json`
  - `norm_sources.json`
  - `norm_refs.json`
  - `clauses.json`
  - `evidence.json`
  - `inspection_items.json`
  - `field_requirements.json`
  - `acceptance_thresholds.json`
  - `provenance.json`
  - `gaps.json`
  - `coverage_matrix.json`
  - `verified_profile.json`
- Project snapshot artifacts:
  - `knowledge_base/engineering/projects/大锦高速/kb_snapshot.json`
  - `knowledge_base/engineering/projects/大锦高速/_deprecated_redirect.json`
- Scripts:
  - `scripts/check_pile_foundation_evidence.py`
  - `scripts/fix_repo_garbles.py`

### Changed
- Normalized dataset artifacts under:
  - `datasets/engineering/bridge13/`
  - `datasets/engineering/bridge14/`
  - `datasets/engineering/bridge15/`
- Cleaned encoding/garble placeholders in dataset corpus and candidate chain files.

### Validation
- Passed checks during this delivery:
  - `python scripts/check_pile_foundation_evidence.py`
  - `python scripts/check_cli_minimal_loop.py`
  - `python scripts/check_authority_boundary.py`
  - `python scripts/check_real_logic_regression.py --strict`
  - `pytest tests/e2e -q`

