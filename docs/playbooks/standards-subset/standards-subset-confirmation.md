# Standards Subset Completion Pack

## Scope

- Project: `GXX-2024-XXX`
- Section: `K15+000~K25+000`
- Goal: confirm the minimum standards subset for current onsite validation.

## Confirmed Standards Subset

1. `JTG F80/1-2017` (evaluation standard)
2. `JTG 3450-2019` (test method standard)
3. `JTG/T F20-2015` (construction control standard)

## Focus Indicators

1. `compaction_degree` (`T0921-2019`)
2. `roughness_iri` (`T0931-2019`)
3. `thickness` (`T0912-2019`)
4. `deflection` (`T0951-2008`)

## Deliverables Linked

1. `projects/gxx-2024-xxx/project.profile.json` (`normative_subset` block)
2. `mappings/cross-spec/indicator_standard_crosswalk.json`
3. `normdocs/library/cn/mot/*/*/normdoc.json` for the 4 focus forms

## Acceptance Criteria

1. The subset is machine-readable from project config.
2. `/chat` rejects execution when `normative_subset` is missing or incomplete.
3. `/project/{project_id}/subset-readiness` returns subset metadata for audit.
