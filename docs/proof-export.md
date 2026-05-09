# Proof Export (Audit Package)

Updated: 2026-04-24

Goal: upgrade proof from internal JSON to an external-facing audit package that legal, audit, and third-party systems can consume.

## 1. Minimal Export Capability

API:

- `POST /api/proof/export`

Request body (choose one target):

- `{ "nodeId": "..." }`
- `{ "containerId": "..." }`

Response returns all 3 export forms in one payload:

- `jsonExport`
- `markdownSummary`
- `pdfReadyPayload` (structured payload, not a rendered PDF file)

## 2. Export Content Contract

The export package includes at least:

- execution summary
- matched spec version
- result summary
- signatures
- timestamps
- linked LayerPegDocument refs

`jsonExport` schema marker:

- `schemaVersion: "proof-audit-export@v1"`

`pdfReadyPayload` template marker:

- `templateId: "proof-audit-pdf@v1"`

## 3. LayerPeg Linking

The export payload includes `linkedLayerPegDocumentRefs` with:

- `role` (`spec | execution | proof`)
- `usi`
- `docType`
- `sourceRef`
- `documentApiPath`

This allows external systems to trace audit evidence without understanding all internal fields.

## 4. Supported Proof Sources

- Node execution:
  - Uses node final proof when available.
  - Falls back to generated proof fragment when node is not finalized yet.
- Container archive:
  - Uses archived container final proof.

## 5. Key Implementation Files

- Export builder: `apps/executable-spec-web/server/services/proof_export_service.ts`
- API route: `apps/executable-spec-web/server/platform-api.ts` (`POST /api/proof/export`)
- Client call: `apps/executable-spec-web/src/platform/api-client.ts` (`exportProofAuditPackage`)
- Tests: `apps/executable-spec-web/server/services/proof_export_service.test.ts`

## 6. Acceptance Mapping

1. One execution result can be exported as a standard audit package.
- Achieved by unified `jsonExport + markdownSummary + pdfReadyPayload`.

2. External systems can read summary without internal schema details.
- Achieved by stable summary fields and explicit LayerPeg document references.
