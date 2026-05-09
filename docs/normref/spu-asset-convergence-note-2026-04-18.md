# SPU Asset Convergence Note (2026-04-18)

## Why this note exists

The repo had mixed SPU naming patterns (`kebab-case` and `dot.case`) and scattered file references
across scripts/tests. This made the structure feel noisy and hard to maintain.

## Canonical naming (active)

- `apps/executable-spec-web/src/subgrade.compaction.spu.yaml`
- `apps/executable-spec-web/src/bridge.pile.strength.spu.yaml`
- `apps/executable-spec-web/src/pavement.flatness.IRI.spu.yaml`

## Manifest-driven source of truth

Core script/test asset selection is now centralized in:

- `apps/executable-spec-web/src/specbot/core/core-asset-manifest.ts`

This manifest is consumed by:

- `apps/executable-spec-web/scripts/generate-core-assets.ts`
- `apps/executable-spec-web/src/specbot/core/core-assets.test.ts`

## Compatibility policy

Old filenames are considered legacy aliases only:

- `subgrade-compaction.spu.yaml`
- `bridge-pile-strength.spu.yaml`
- `pavement-flatness.spu.yaml`

No new code should reference legacy names.

