# SDK (JS + Python)

## Goal

Provide SDK clients on top of `public v1` APIs so third-party systems can integrate quickly without calling low-level endpoints directly.

Supported high-level operations:
- register spec
- execute
- query proof

## Locations

- JS SDK: `apps/executable-spec-web/sdk/js/normpeg-sdk.js`
- JS quickstart: `apps/executable-spec-web/sdk/js/examples/quickstart.js`
- Python SDK: `apps/executable-spec-web/sdk/python/normpeg_sdk.py`
- Python quickstart: `apps/executable-spec-web/sdk/python/examples/quickstart.py`

## Public API Mapping

SDK methods map to stable public APIs:

- `registerSpecMarkdown` / `register_spec_markdown`  
  -> `POST /api/public/v1/specs/register-markdown`
- `publishSpu` / `publish_spu`  
  -> `POST /api/public/v1/spus/publish`
- `registerSpec` / `register_spec`  
  -> unified wrapper for markdown or definition registration
- `execute`  
  -> `POST /api/public/v1/executions/evaluate`
- `queryProof` / `query_proof`  
  -> `GET /api/public/v1/proofs/:containerId`

## Envelope Handling

Both SDKs:
- parse public envelope (`ok/data/error/meta`)
- return unwrapped `data`
- raise structured errors when `ok=false` or HTTP status >= 400

Error payload keeps:
- `code` (e.g. `PUBLIC_INVALID_ARGUMENT`)
- `status`
- `requestId`
- `details`

## Auth and Tenant Defaults

SDK sends:
- `x-user-role` (default `admin`)
- `x-actor-id` (default `sdk-client`)
- `x-tenant-id` (default `default`)

These can be overridden per client instance.

## JS Example

```js
import { NormPegClient } from "./normpeg-sdk.js";

const client = new NormPegClient({
  baseUrl: "http://localhost:8790",
  role: "admin",
  actorId: "partner-system",
  tenantId: "default",
});

// 1) Register spec
await client.registerSpec({
  markdown: "# Demo Spec\ninput: value\nrule: result >= 90",
});

// 2) Execute
const exec = await client.execute({
  spuId: "demo.spu@v1",
  containerId: "container_001",
  inputs: { value: 95 },
});

// 3) Query proof (container must be archived)
const proof = await client.queryProof("container_001");
console.log(exec, proof);
```

Run quickstart:

```bash
cd apps/executable-spec-web/sdk/js/examples
node quickstart.js
```

## Python Example

```python
from normpeg_sdk import NormPegClient

client = NormPegClient(
    base_url="http://localhost:8790",
    role="admin",
    actor_id="partner-system",
    tenant_id="default",
)

# 1) Register spec
client.register_spec(markdown="# Demo Spec\ninput: value\nrule: result >= 90")

# 2) Execute
exec_result = client.execute(
    {
        "spuId": "demo.spu@v1",
        "containerId": "container_001",
        "inputs": {"value": 95},
    }
)

# 3) Query proof (container must be archived)
proof_result = client.query_proof("container_001")
print(exec_result, proof_result)
```

Run quickstart:

```bash
cd apps/executable-spec-web/sdk/python/examples
python quickstart.py
```

## Notes

- `query proof` returns archived container proof; if container is not archived yet, API may return `PUBLIC_NOT_FOUND`.
- For low-level access (mapping export/proof export), use `public-api-suite.md` endpoints directly.
