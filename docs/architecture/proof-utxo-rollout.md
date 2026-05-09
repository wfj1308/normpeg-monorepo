# Proof-UTXO Rollout

## 1) Apply migration

Run:

```sql
-- infra/supabase/009_proof_utxo_engine.sql
```

This creates:

- `proof_utxo`
- `proof_transaction`
- `proof_condition_log`

And backfills historical rows from `proof_chain`.

## 2) Runtime switches

Environment variables:

- `PROOF_UTXO_AUTO_CONSUME=true`
- `PROOF_UTXO_GITPEG_ANCHOR_ENABLED=true|false`
- `GITPEG_PROOF_ANCHOR_PATH=/api/v1/proof/anchor`
- `GITPEG_PROOF_ANCHOR_TOKEN=...`

Enterprise-level `custom_fields` (higher priority):

- `proof_utxo_auto_consume`
- `proof_utxo_gitpeg_anchor_enabled`
- `gitpeg_proof_anchor_path`
- `gitpeg_proof_anchor_endpoint`
- `gitpeg_anchor_token`
- `gitpeg_proof_anchor_timeout_s`

## 3) API endpoints

- `GET /v1/proof/utxo/unspent`
- `POST /v1/proof/utxo/create`
- `POST /v1/proof/utxo/consume`
- `POST /v1/proof/utxo/auto/inspection-settle`
- `GET /v1/proof/utxo/{proof_id}`
- `GET /v1/proof/utxo/{proof_id}/chain`
- `GET /v1/proof/utxo/transactions/list`

## 4) Manual API verification

Verify the end-to-end flow with APIs:

1. Create a LAB UTXO by calling `POST /v1/proof/utxo/create` with `proof_type=lab`.
2. Submit an inspection by calling `POST /v1/inspections/` (or create inspection UTXO directly with `proof_type=inspection`).
3. Trigger settle via `POST /v1/proof/utxo/auto/inspection-settle`.
4. Confirm unspent payment output via `GET /v1/proof/utxo/unspent` with `proof_type=payment` and `result=PASS`.
