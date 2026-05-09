# Service Execution Report

## Date

- 2026-04-15

## Execution Summary

1. Tried edge one-click deployment: `ops/scripts/nl2gate-api/start.ps1`
2. Result: failed because Docker engine was not running on this machine.
3. Continued with local service mode (`uvicorn`) to complete smoke and trial scenarios.

## Deployment Attempt

- Command: `./ops/scripts/nl2gate-api/start.ps1`
- Result: failed
- Reason: Docker Desktop Linux engine pipe not found (`//./pipe/dockerDesktopLinuxEngine`).

## Ops Validation (Local Service Mode)

- `/ops/ready`: `ready`
- `/ops/smoke`: `pass`

## Field Trial Scenarios

1. `K15+200 压实度 96.5 合格吗`
   - `form_type`: `T0921-2019`
   - `status`: `PASS`
   - `cross_spec_links`: present

2. `K16+100 IRI 1.9 是否通过`
   - `form_type`: `T0931-2019`
   - `status`: `PASS`
   - `cross_spec_links`: present

3. `K18+600 上面层厚度 58 是否达标`
   - `form_type`: `T0912-2019`
   - `status`: `BLOCKED`
   - `reply`: `Thickness is out of design tolerance range.`
   - `cross_spec_links`: present

4. `K19+200 弯沉 170 合格吗`
   - `form_type`: `T0951-2008`
   - `status`: `PASS`
   - `cross_spec_links`: present

## Conclusion

- Service software deliverables and runtime checks are complete.
- Remaining blocker for full edge deployment is environment-level Docker engine startup.
