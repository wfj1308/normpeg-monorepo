# Module Boundary (Builder / Executor / Runtime / Debug)

Updated: 2026-04-23
Scope: minimal routing and structure refactor only, keep existing visual style and business behavior.

## 1. Target

Split the current mixed workspace into four clear zones:

- Builder: spec authoring and compilation
- Executor: spec-level execution and retry workflow
- Runtime: container lifecycle, scheduling, archive and proof
- Debug: internal API integration and troubleshooting

Acceptance intent:

- users can clearly identify Build vs Execute vs Runtime zones
- debugging capabilities remain available, but not as default entry

## 2. Page Mapping Table

| Existing page/section | Category | Main source |
|---|---|---|
| `SpecTemplateLibraryPanel` | Builder | `apps/executable-spec-web/src/components/SpecTemplateLibraryPanel.tsx` |
| `PDFToMarkdownDraftPanel` | Builder | `apps/executable-spec-web/src/components/PDFToMarkdownDraftPanel.tsx` |
| `MarkdownSpecImportPanel` | Builder | `apps/executable-spec-web/src/components/MarkdownSpecImportPanel.tsx` |
| `资源导入（高级设置）` | Builder | `apps/executable-spec-web/src/SPUApp.tsx` |
| `规范选择区（全部已注册 SPU）` | Executor | `apps/executable-spec-web/src/SPUApp.tsx` |
| `4. 规范执行卡片区` | Executor | `apps/executable-spec-web/src/SPUApp.tsx` |
| `5. 当前执行区` | Executor | `apps/executable-spec-web/src/SPUApp.tsx` |
| `6. 复检记录` | Executor | `apps/executable-spec-web/src/SPUApp.tsx` |
| `10. NL2Gate 受控入口（最小接入）` | Executor | `apps/executable-spec-web/src/SPUApp.tsx` |
| `当前检测点` | Runtime | `apps/executable-spec-web/src/SPUApp.tsx` |
| `当前容器` | Runtime | `apps/executable-spec-web/src/SPUApp.tsx` |
| `验收进度区` | Runtime | `apps/executable-spec-web/src/SPUApp.tsx` |
| `调度建议` | Runtime | `apps/executable-spec-web/src/SPUApp.tsx` |
| `7. 验收与存证` | Runtime | `apps/executable-spec-web/src/SPUApp.tsx` |
| `8. LayerPeg 五层文档（最小接入）` | Runtime | `apps/executable-spec-web/src/SPUApp.tsx` |
| `9. 构件目录` | Runtime | `apps/executable-spec-web/src/SPUApp.tsx` |
| `NormRef API 矩阵联调` | Debug | `apps/executable-spec-web/src/SPUApp.tsx` |

## 3. Route Refactor (Minimal)

Module route switched to path style:

- `/builder`
- `/executor`
- `/runtime`
- `/debug`

Notes:

- default entry is `builder`
- backward compatibility kept for old query routing `?module=...`
- canonical URL is path route; `module` query is removed when switching

Implementation:

- `apps/executable-spec-web/src/routing/module-route.ts`
- `apps/executable-spec-web/src/routing/module-route.test.ts`

## 4. Directory Restructure (Minimal)

Module boundary metadata moved into dedicated folders:

```text
apps/executable-spec-web/src/modules/
  builder/sections.ts
  executor/sections.ts
  runtime/sections.ts
  debug/sections.ts
  section-map.ts
  module-config.ts
```

Behavior:

- no functional removal
- no major visual redesign
- module boundaries are now explicit in code and shown in module entry panel

## 5. Debug Zone Policy

Debug capability is retained as internal zone:

- visible in module switch as internal entry
- not used as default landing module
- all API matrix debugging actions remain intact

## 6. Verification Checklist

- Builder, Executor, Runtime have explicit module partitions
- Debug remains available and isolated
- Default entry is Builder, not Debug
- Existing section-level functions remain callable
