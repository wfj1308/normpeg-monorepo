# Roles And Approval (Minimal)

## Goal
- Add minimal role constraints and approval chain without introducing complex RBAC.
- Ensure Builder / Executor / Runtime related actions have clear boundaries.

## Roles
- `admin`
- `builder`
- `expert`
- `inspector`
- `supervisor`

Code:
- [authorization_service.ts](/d:/wfj/project/normpeg-monorepo/apps/executable-spec-web/server/services/authorization_service.ts)

## Permission Matrix (Minimal)

| Action | Allowed Roles |
|---|---|
| `compile` | `admin`, `builder` |
| `register` | `admin` |
| `approve_candidate_rule` | `admin`, `expert` |
| `execute` | `admin`, `inspector`, `supervisor` |
| `sign_proof` | `admin`, `expert`, `inspector`, `supervisor` |
| `archive` | `admin`, `supervisor` |

Notes:
- `sign_proof` has extra check:
  - `inspector` can only sign as `inspector`.
  - `supervisor` can only sign as `supervisor`.
  - `admin` / `expert` can sign cross-role when required by process.

## API Enforcement

Permission checks are enforced in:
- [platform-api.ts](/d:/wfj/project/normpeg-monorepo/apps/executable-spec-web/server/platform-api.ts)

Key routes:
- `compile`
  - `POST /api/spec/compile-markdown`
  - `POST /api/spec/pdf-to-draft`
- `register`
  - `POST /api/spec/register-markdown`
  - `POST /api/spec/register-template`
  - `POST /api/registry/spu-versions/publish`
  - `POST /api/registry/import`
- `approve_candidate_rule`
  - `POST /api/approval/candidates/:id/review`
  - `POST /api/approval/candidates/:id/decision`
- `execute`
  - `POST /api/gate/evaluate` and batch variants
  - `POST /api/runtime/project-execute`
  - `POST /api/nodes`
  - `POST /api/nodes/:id/submit`
  - `POST /api/nodes/:id/finalize`
- `sign_proof`
  - `POST /api/nodes/:id/sign`
- `archive`
  - `POST /api/containers/:id/archive`

## Minimal Approval Flow

Code:
- [approval_flow_service.ts](/d:/wfj/project/normpeg-monorepo/apps/executable-spec-web/server/services/approval_flow_service.ts)

Status chain:
- `draft -> submitted -> in_review -> approved/rejected -> published -> deprecated`

### Candidate APIs
- `POST /api/approval/candidates`
  - create candidate rule proposal
- `GET /api/approval/candidates`
  - list candidates
- `GET /api/approval/candidates/:id`
  - candidate detail
- `POST /api/approval/candidates/:id/review`
  - move to review
- `POST /api/approval/candidates/:id/submit`
  - submit draft for formal review
- `POST /api/approval/candidates/:id/decision`
  - approve or reject
- `POST /api/approval/candidates/:id/publish`
  - publish approved candidate
  - can optionally publish SPU definition and bind publish record
- `POST /api/approval/candidates/:id/deprecate`
  - deprecate a previously published asset

## Header Convention

Request identity is carried by headers:
- `x-user-role`: role name
- `x-actor-id`: actor identifier

If `x-user-role` is not provided, server falls back to `admin` (for backward compatibility with existing clients).

Client helpers:
- [api-client.ts](/d:/wfj/project/normpeg-monorepo/apps/executable-spec-web/src/platform/api-client.ts)
  - `setPlatformActorRole(...)`
  - `setPlatformActorId(...)`

## Acceptance Mapping
- Different roles cannot perform arbitrary actions: enforced via permission matrix and route checks.
- Spec publish and proof signing have minimal approval chain:
  - publish can run through `candidate -> review -> approve -> publish`
  - proof signing is role-constrained and checked on sign endpoint.
