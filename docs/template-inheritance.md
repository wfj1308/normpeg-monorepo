# Template Inheritance for SPU and SpecBundle

Updated: 2026-04-23

Goal: enable users to derive same-family SPUs from templates instead of modeling from scratch, while keeping full lineage to the template source.

## 1. Template Structure

`SpecMarkdownTemplate` now includes:
- `templateId`
- `baseType`
- `reusableFields`
- `rulePlaceholders`
- `defaultProofRequirements`
- `variables`
- `markdownTemplate`

Key files:
- `apps/executable-spec-web/src/spec-compiler/templates/types.ts`
- `apps/executable-spec-web/src/spec-compiler/templates/builtins.ts`

## 2. Derivation Capability

### 2.1 Derive SPU from Template

Entry points:
- `POST /api/spec/register-template`
- `createAndRegisterSpecFromTemplate(...)`

Flow:
1. Load template by `templateId`.
2. Merge provided values with optional overrides.
3. Render markdown from template.
4. Compile and register SPU.
5. Produce specbundle.

### 2.2 Supported Overrides

`register-template` supports:
- `overrides.clause`
- `overrides.threshold`
- `overrides.description`
- `inheritFromSpuId` (optional parent SPU reference)

Override behavior:
- `clause`: overrides clause variable.
- `threshold`: overrides threshold placeholder variable detected by `rulePlaceholders` (with fallback key match).
- `description`: injects rule description placeholder.

### 2.3 Lineage and Traceability

During derivation, lineage is written to:
- Registered SPU proof extensions.
- Generated specbundle `spec.json` proof extensions.

Location: `proof.extensions.templateInheritance`

Relation payload (`TemplateSpuRelation`) includes:
- `templateId`
- `baseType`
- `inheritedFromSpuId`
- `derivedSpuId`
- `overrides`
- `createdAt`
- `reusableFieldKeys`
- `rulePlaceholderKeys`
- `defaultProofRequirements`

## 3. Template-SPU Relationship Model

Relationship:
- `Template (1) -> Derived SPU (N)`

Each derived SPU keeps:
- source template id
- template base type
- applied override values
- optional inherited parent SPU id

This enables repeatable modeling for same-family norms and auditable lineage.

## 4. Key Implementation Files

- Template types: `apps/executable-spec-web/src/spec-compiler/templates/types.ts`
- Built-in templates: `apps/executable-spec-web/src/spec-compiler/templates/builtins.ts`
- Derivation core: `apps/executable-spec-web/src/spec-compiler/templates/create_from_template.ts`
- Register pipeline extension injection: `apps/executable-spec-web/src/spec-compiler/register_markdown.ts`
- Compile stage extension persistence into specbundle: `apps/executable-spec-web/src/spec-compiler/compile_spec.ts`
- API route integration: `apps/executable-spec-web/server/platform-api.ts`

## 5. Acceptance Mapping

1. Same-family specs do not need zero-based remodeling.
- Achieved via template derivation + targeted overrides.

2. Derived SPUs retain template linkage.
- Achieved via `proof.extensions.templateInheritance` in both SPU runtime shape and specbundle output.
