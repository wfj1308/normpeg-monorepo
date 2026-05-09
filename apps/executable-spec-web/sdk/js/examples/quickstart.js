import { NormPegClient } from "../normpeg-sdk.js";

async function main() {
  const client = new NormPegClient({
    baseUrl: "http://localhost:8790",
    role: "admin",
    actorId: "demo-js-sdk",
    tenantId: "default",
  });

  // 1) Register spec from markdown.
  const registerResult = await client.registerSpec({
    markdown: `
# Demo Spec
input: value
rule: result >= 90
`,
  });
  console.log("register result:", registerResult);

  // 2) Execute.
  const executeResult = await client.execute({
    spuId: "demo.spu@v1",
    containerId: "container_001",
    inputs: { value: 95 },
  });
  console.log("execute result:", executeResult);

  // 3) Query proof (container must be archived in workflow).
  const proofResult = await client.queryProof("container_001");
  console.log("proof result:", proofResult);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

