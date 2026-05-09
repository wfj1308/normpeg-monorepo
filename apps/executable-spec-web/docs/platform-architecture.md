# Norm-Driven Execution Platform Architecture

## Layered Structure

```text
apps/executable-spec-web
├─ server/
│  └─ platform-api.ts                    # REST API entry
├─ src/
│  ├─ SPUApp.tsx                         # Platform UI (Dashboard/Registry/Workspace/Audit)
│  ├─ platform/
│  │  ├─ types.ts                        # Platform core models
│  │  ├─ api-client.ts                   # Frontend API adapter
│  │  ├─ index.ts                        # Barrel exports
│  │  ├─ audit/
│  │  │  ├─ events.ts                    # Event type constants
│  │  │  └─ event-store.ts               # Event sourcing store
│  │  ├─ norm/
│  │  │  ├─ builtin-spus.ts              # Builtin SPU definitions
│  │  │  └─ registry.ts                  # JSON/YAML registry loader
│  │  ├─ runtime/
│  │  │  ├─ execution-engine.ts          # create/submit/path/rules/sign/finalize
│  │  │  ├─ rule-engine.ts               # operator engine
│  │  │  └─ rule-engine.test.ts
│  │  ├─ spatial/                        # Reserved for BIM/IoT spatial adapters
│  │  ├─ workflow/
│  │  │  └─ platform-service.ts          # container/node orchestration
│  │  ├─ proof/
│  │  │  ├─ hash.ts                      # SHA-256 proof hash
│  │  │  ├─ anchor-service.ts            # Mock anchor
│  │  │  └─ proof-service.ts             # container proof aggregator
│  │  ├─ export/
│  │  │  └─ export-service.ts            # Markdown/JSON/specbundle export
│  │  └─ demo/
│  │     ├─ subgrade-demo.ts             # K19+070 full scenario
│  │     ├─ subgrade-demo.test.ts
│  │     └─ sample-proof.json
│  └─ index.css                          # Tailwind entry
└─ tailwind.config.js / postcss.config.js
```

## API Endpoints

- `POST /api/slots/import`
- `POST /api/containers`
- `GET /api/containers/:id`
- `POST /api/containers/:id/bind-spu`
- `POST /api/nodes`
- `POST /api/nodes/:id/submit`
- `POST /api/nodes/:id/sign`
- `POST /api/nodes/:id/finalize`
- `POST /api/containers/:id/archive`
- `GET /api/containers/:id/proof`
- `GET /api/audit/:entityType/:entityId`

## Event Types

- `SLOT_IMPORTED`
- `CONTAINER_CREATED`
- `SPU_BOUND`
- `NODE_CREATED`
- `FORM_SUBMITTED`
- `PATH_EXECUTED`
- `RULES_EVALUATED`
- `NODE_SIGNED`
- `NODE_FINALIZED`
- `CONTAINER_ARCHIVED`
