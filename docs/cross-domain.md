# Cross-Domain Execution Framework

## Goal

This iteration upgrades the runtime from a single-engineering-domain implementation to a cross-domain execution framework, while keeping backward compatibility with existing SPU assets.

Target domains include (but are not limited to):
- construction
- manufacturing
- quality inspection

## 1. SPU Classification Model

Core SPU classification is now standardized as:
- `measurement`
- `validation`
- `compliance`

### Type Definition

`SPUDefinition.meta` adds:
- `classification?: "measurement" | "validation" | "compliance"`
- `domain?: string`
- `domainTags?: string[]`

Legacy fields are retained for compatibility only:
- `category?`
- `workItem?`
- `measuredItem?`

These legacy fields are no longer required by the cross-domain runtime model.

## 2. Domain Adapter Layer

A new adapter abstraction is introduced:

- `DomainAdapter`
  - `adapterId`
  - `supports(spu)`
  - `classify(spu)`
  - `resolveDomain(spu)`
  - `resolveIndustryTag(normSource, spu)`
  - `resolveTags(spu)`

- `DomainAdapterRegistry`
  - register adapters by priority
  - resolve adapter per SPU
  - produce `CrossDomainSpuProfile`
  - apply profile back into SPU meta

### Built-in Generic Adapter

`GenericDomainAdapter` acts as fallback (lowest priority).

Default classification inference:
- no rules -> `measurement`
- has rules + no signatures -> `validation`
- has rules + required signatures -> `compliance`

## 3. Runtime Integration

### Norm Registry Normalization

During SPU register/publish normalization, system now applies cross-domain profile automatically:
- fill `meta.domain`
- fill `meta.classification`
- fill `meta.domainTags`

This ensures old SPUs become cross-domain-aware without manual migration.

### SPU Selector Upgrade

Selector now supports both legacy hints and cross-domain hints.

Input supports:
- `projectContext.preferredDomain`
- `projectContext.preferredClassification`
- `hints.domain`
- `hints.classification`

Ranking keeps existing priorities and adds explainable cross-domain matches:
- project-bound active
- exact domain
- exact classification
- exact category / clause / measuredItem (legacy-compatible)

### NL2Gate Integration

NL2Gate still routes through SPU/Gate only, and now passes classification/domain-aware selector hints when available. It remains a controlled execution entry, not a free-form chatbot.

## 4. Public Query API (Cross-Domain)

### List SPUs by classification

`GET /api/registry/spus?classification=measurement|validation|compliance`

### Query one SPU cross-domain profile

`GET /api/registry/spus/:spuId/profile`

Response includes:
- `adapterId`
- `domain`
- `classification`
- `industryTag`
- `tags`

## 5. Removing Industry Hardcoding (Scope)

This upgrade removes hard dependency on a single industry from core execution abstractions by:
- moving domain semantics to adapter/profile
- using normalized cross-domain fields in selector and catalog derivation
- keeping existing engineering-specific examples as sample data only

Meaning:
- framework core is industry-agnostic
- demo/test assets may still contain domain-specific terms for scenario coverage

## 6. How to Add a New Industry Quickly

1. Implement a custom `DomainAdapter`.
2. Register it via `registerDomainAdapter(...)`.
3. Optionally provide domain-specific tags/classification overrides.
4. Re-import or publish SPUs (normalization auto-applies profile).
5. Use selector hints (`domain`/`classification`) to guide execution entry.

## 7. Acceptance Mapping

- System no longer binds execution semantics to a single industry model in core runtime paths.
- SPU classification is standardized to `measurement/validation/compliance`.
- Domain adapter extension point is available and test-covered.
- New industries can be introduced by adapter + SPU metadata, without rewriting Gate/Proof flow.
