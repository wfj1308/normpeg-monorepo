import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SPU_EXAMPLES } from "./spu-examples.ts";
import { createNode, executeNode, getNodeSnapshot, signNode, submitForm } from "./spu-runtime.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const subgradeYamlPath = resolve(currentDir, "./subgrade.compaction.spu.yaml");
readFileSync(subgradeYamlPath, "utf-8");

function printScenario(spuId: string, label: string, inputs: Record<string, number>) {
  const example = SPU_EXAMPLES.find((item) => item.spu.spuId === spuId);
  if (!example) {
    throw new Error(`SPU example not found: ${spuId}`);
  }

  const draftNode = createNode(spuId);
  const filledNode = submitForm(draftNode, inputs);
  const signingNode = executeNode(filledNode);

  console.log(`\n${label}`);
  console.log(`Input: ${JSON.stringify(inputs)}`);
  console.log("");
  console.log("Execution:");
  console.log(`Status after executeNode: ${signingNode.status}`);
  for (const output of example.spu.data.outputs) {
    console.log(`${output.name}: ${signingNode.execution_result?.[output.name]}`);
  }
  console.log("");
  console.log("Trace:");
  for (const item of signingNode.proof?.trace ?? []) {
    console.log(`${item.step}: ${item.formula} => ${item.result}`);
  }
  console.log("");
  console.log("Gate:");
  for (const item of signingNode.gate_result?.results ?? []) {
    console.log(
      `${item.ruleId}: ${item.field} ${item.operator} ${item.expected} -> ${item.actual} => ${item.passed ? "PASS" : "FAIL"}`,
    );
  }
  console.log("");
  console.log("Proof:");
  console.log(JSON.stringify(signingNode.proof, null, 2));
  console.log("");
  console.log("Signing:");
  console.log(`Pending before signatures: ${signingNode.proof?.pendingSignatures.join(", ")}`);
  const afterLab = signNode(signingNode, "lab");
  console.log(`After lab: ${afterLab.proof?.pendingSignatures.join(", ") || "(none)"}`);
  const afterSupervision = signNode(afterLab, "supervision");
  console.log(`After supervision: ${afterSupervision.proof?.pendingSignatures.join(", ") || "(none)"}`);
  console.log(`Final node status: ${getNodeSnapshot(spuId).status}`);
}

for (const example of SPU_EXAMPLES) {
  console.log(`SPU loaded: ${example.spu.meta.name}`);
  console.log(`Norm: ${example.spu.meta.norm} ${example.spu.meta.clause}`);
  printScenario(example.spu.spuId, "PASS scenario", example.passInputs);
  printScenario(example.spu.spuId, "FAIL scenario", example.failInputs);
  console.log("\n==============================\n");
}

