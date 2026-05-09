# ERPNext Methods Required By QCSpec

QCSpec expects these ERPNext methods:

1. `zbgc_integration.qcspec.get_project_basics`
2. `zbgc_integration.qcspec.get_metering_requests`
3. `zbgc_integration.qcspec.notify`

Reference implementation is in:

- `docs/erpnext_qcspec_methods.py`

## Suggested rollout

1. Put `erpnext_qcspec_methods.py` into your custom Frappe app module (for example `zbgc_integration/qcspec.py`).
2. Ensure methods are reachable under `zbgc_integration.qcspec.*`.
3. Create required doctypes/tables if names differ:
   - `QC Metering Request`
   - `QCSpec Notify Log`
4. Run:
   - `bench --site development.localhost clear-cache`
5. Verify from QCSpec:
   - `GET /v1/erpnext/project-basics?...`
   - `GET /v1/erpnext/metering-requests?...`
   - submit one inspection and check `erpnext_notify` in response.

## Contract notes

- `get_project_basics` should return project base fields usable by QCSpec registration.
- `get_metering_requests` should support `project_code` and return pending metering rows with `project/stake/subitem/amount/status`.
- `notify` should persist raw payload and update metering request status:
  - `release` -> approved path
  - `block` -> intercepted path
