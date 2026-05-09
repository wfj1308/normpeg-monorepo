# Monorepo Structure (Standards-First)

## Design Goals

- Standards and norms are first-class assets, independent from any single app.
- Runtime services are consumers of shared assets, not their owners.
- Paths are deterministic and versioned for governance and automation.

## Canonical Paths

- Standards: `standards/library/cn/mot/<standard>/<year>/standarddoc.json`
- NormDocs: `normdocs/library/cn/mot/<form>/<year>/normdoc.json`
- Projects: `projects/<project-slug>/project.profile.json`
- Cross-spec mappings: `mappings/cross-spec/*.json`
- API app: `apps/nl2gate-api/`
- Ops: `ops/docker/`, `ops/scripts/`
- Tests: `tests/smoke/`

## Current Pilot Assets

- `projects/gxx-2024-xxx/project.profile.json`
- `standards/library/cn/mot/jtg-f80-1/2017/standarddoc.json`
- `standards/library/cn/mot/jtg-3450/2019/standarddoc.json`
- `standards/library/cn/mot/jtg-t-f20/2015/standarddoc.json`
- `normdocs/library/cn/mot/t0921/2019/normdoc.json`
- `normdocs/library/cn/mot/t0931/2019/normdoc.json`
- `normdocs/library/cn/mot/t0912/2019/normdoc.json`
- `normdocs/library/cn/mot/t0951/2008/normdoc.json`

## Migration Note

Legacy `nl2gate/` demo-style layout was split into domain folders. The remaining `nl2gate/README.md` is only a migration pointer.
