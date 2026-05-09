import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { SPULoader } from "./spu-loader.ts";
import { SPU_EXAMPLES } from "./spu-examples.ts";
import { createNode, executeNode, executePath, executeRules, getNodeSnapshot, signNode, submitForm, submitNode } from "./spu-runtime.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const yamlPath = resolve(currentDir, "./subgrade.compaction.spu.yaml");
const yamlContent = readFileSync(yamlPath, "utf-8");
const thicknessYaml = `spuId: "highway.subgrade.thickness.4.2.3@v1"

meta:
  name: "Subgrade Thickness"
  norm: "JTG F80/1-2017"
  clause: "4.2.3"
  version: "v1"

forms:
  - formCode: "SUBGRADE_THICKNESS_FORM"
    role: "lab"
    required: true

data:
  inputs:
    - name: measuredThickness
      type: number
      label: "Measured thickness"
    - name: designThickness
      type: number
      label: "Design thickness"
  outputs:
    - name: thicknessDeviation
    - name: thicknessValue

path:
  - step: resolve_thickness_value
    formula: "thicknessValue = measuredThickness"
  - step: calc_thickness_deviation
    formula: "thicknessDeviation = measuredThickness - designThickness"

rules:
  - ruleId: "RULE-THICKNESS-001"
    field: "thicknessValue"
    operator: ">="
    value: 200
    message: "Thickness must be >= 200"

proof:
  resultField: "thicknessValue"
  passMessage: "Thickness passes"
  failMessage: "Thickness fails"
  requiredSignatures:
    - lab
    - supervision
`;

const deflectionYaml = `spuId: "highway.subgrade.deflection.4.2.2@v1"

meta:
  name: "Subgrade Deflection"
  norm: "JTG F80/1-2017"
  clause: "4.2.2"
  version: "v1"

forms:
  - formCode: "SUBGRADE_DEFLECTION_FORM"
    role: "lab"
    required: true

data:
  inputs:
    - name: measuredDeflection
      type: number
      label: "Measured deflection"
    - name: maxAllowedDeflection
      type: number
      label: "Max allowed deflection"
  outputs:
    - name: deflectionValue

path:
  - step: resolve_deflection_value
    formula: "deflectionValue = measuredDeflection"

rules:
  - ruleId: "RULE-DEFLECTION-001"
    field: "deflectionValue"
    operator: "<="
    value: "**INPUT**:maxAllowedDeflection"
    message: "Deflection must be <= allowed value"

proof:
  resultField: "deflectionValue"
  passMessage: "Deflection passes"
  failMessage: "Deflection fails"
  requiredSignatures:
    - lab
    - supervision
`;

function passInputs() {
  return {
    massHoleSand: 1980,
    massSandCone: 500,
    volumeSand: 1000,
    moistureContent: 5,
    maxDryDensity: 1.95,
  };
}

function failInputs() {
  return {
    massHoleSand: 1720,
    massSandCone: 500,
    volumeSand: 1000,
    moistureContent: 8,
    maxDryDensity: 1.95,
  };
}

test("createNode loads forms path rules and starts in DRAFT", () => {
  const loader = new SPULoader();
  const spu = loader.load(yamlContent);

  const node = createNode(spu.spuId);

  assert.equal(node.status, "DRAFT");
  assert.equal(node.loadedForms[0]?.formCode, "SUBGRADE_COMPACTION_FORM");
  assert.equal(node.loadedPath.length, 3);
  assert.equal(node.loadedRules.length, 1);
});

test("createNode supports optional containerId and stores container_ref", () => {
  const loader = new SPULoader();
  const spu = loader.load(yamlContent);

  const node = createNode({
    spuId: spu.spuId,
    containerId: "v://space/container/demo-container",
  });
  const snapshot = getNodeSnapshot(spu.spuId);

  assert.equal(node.container_ref, "v://space/container/demo-container");
  assert.equal(snapshot.container_ref, "v://space/container/demo-container");
});

test("createNode supports optional volumeRef and stores volume_ref", () => {
  const loader = new SPULoader();
  const spu = loader.load(yamlContent);

  const node = createNode({
    spuId: spu.spuId,
    containerId: "v://space/container/demo-container",
    volumeRef: "v://space/volume/K19+070",
  });
  const snapshot = getNodeSnapshot(spu.spuId);

  assert.equal(node.volume_ref, "v://space/volume/K19+070");
  assert.equal(snapshot.volume_ref, "v://space/volume/K19+070");
});

test("createNode supports node metadata for container attempts", () => {
  const loader = new SPULoader();
  const spu = loader.load(yamlContent);

  const node = createNode({
    spuId: spu.spuId,
    containerId: "v://space/container/demo-container",
    nodeId: "v://space/node/attempt-2",
    attemptIndex: 2,
    createdAt: "2026-04-20T12:00:00Z",
  });

  assert.equal(node.node_id, "v://space/node/attempt-2");
  assert.equal(node.attempt_index, 2);
  assert.equal(node.created_at, "2026-04-20T12:00:00Z");
});

test("submitForm stores inputs and moves node to FILLED", () => {
  const loader = new SPULoader();
  const spu = loader.load(yamlContent);
  const node = createNode(spu.spuId);

  const filledNode = submitForm(node, passInputs());
  const snapshot = getNodeSnapshot(spu.spuId);

  assert.equal(filledNode.status, "FILLED");
  assert.equal(snapshot.status, "FILLED");
  assert.equal(snapshot.submittedFormCode, "SUBGRADE_COMPACTION_FORM");
  assert.deepEqual(snapshot.formData, passInputs());
});

test("executeNode computes gate and enters SIGNING before signatures", () => {
  const loader = new SPULoader();
  const spu = loader.load(yamlContent);
  const node = createNode(spu.spuId);
  const filledNode = submitForm(node, passInputs());

  const executedNode = executeNode(filledNode);

  assert.equal(executedNode.status, "SIGNING");
  assert.equal(executedNode.execution_result?.compactionDegree, 96.7026);
  assert.equal(executedNode.gate_result?.passed, true);
  assert.ok(executedNode.proof);
  assert.equal(executedNode.proof?.status, "FINAL_PASS");
  assert.deepEqual(executedNode.proof?.pendingSignatures, ["lab", "supervision"]);
  assert.deepEqual(executedNode.proof?.signedBy, []);
});

test("signNode keeps SIGNING until all signatures are done, then FINAL_PASS", () => {
  const loader = new SPULoader();
  const spu = loader.load(yamlContent);
  const node = createNode(spu.spuId);
  const filledNode = submitForm(node, passInputs());
  const executedNode = executeNode(filledNode);

  const afterLab = signNode(executedNode, "lab");
  const afterSupervision = signNode(afterLab, "supervision");
  const snapshot = getNodeSnapshot(spu.spuId);

  assert.equal(afterLab.status, "SIGNING");
  assert.deepEqual(afterLab.proof?.pendingSignatures, ["supervision"]);
  assert.deepEqual(afterLab.proof?.signedBy, ["lab"]);
  assert.equal(afterSupervision.status, "FINAL_PASS");
  assert.deepEqual(afterSupervision.proof?.pendingSignatures, []);
  assert.deepEqual(afterSupervision.proof?.signedBy, ["lab", "supervision"]);
  assert.equal(snapshot.status, "FINAL_PASS");
  assert.deepEqual(snapshot.completedSignatures, ["lab", "supervision"]);
});

test("failed gate still enters SIGNING and ends in FINAL_FAIL after signatures", () => {
  const loader = new SPULoader();
  const spu = loader.load(yamlContent);
  const node = createNode(spu.spuId);
  const filledNode = submitForm(node, failInputs());
  const executedNode = executeNode(filledNode);

  assert.equal(executedNode.status, "SIGNING");
  assert.equal(executedNode.gate_result?.passed, false);
  assert.equal(executedNode.proof?.status, "FINAL_FAIL");

  const afterLab = signNode(executedNode, "lab");
  const afterSupervision = signNode(afterLab, "supervision");

  assert.equal(afterSupervision.status, "FINAL_FAIL");
});

test("second SPU also follows the generic lifecycle", () => {
  const bridgePileStrength = SPU_EXAMPLES.find((item) => item.spu.spuId === "highway.bridge.pile.strength.quality@v1");
  assert.ok(bridgePileStrength);

  const node = createNode(bridgePileStrength.spu.spuId);
  const filledNode = submitForm(node, bridgePileStrength.passInputs);
  const executedNode = executeNode(filledNode);
  const signedNode = signNode(executedNode, "lab");

  assert.equal(node.loadedForms[0]?.formCode, "BRIDGE_PILE_STRENGTH_FORM");
  assert.equal(filledNode.status, "FILLED");
  assert.equal(executedNode.status, "SIGNING");
  assert.equal(signedNode.status, "SIGNING");
  assert.deepEqual(signedNode.proof?.pendingSignatures, ["supervision"]);
});

test("executePath dynamically runs each formula in order", () => {
  const outputs = executePath(
    [
      { step: "calc_wet_density", formula: "wetDensity = massHoleSand / volumeSand" },
      { step: "calc_dry_density", formula: "dryDensity = wetDensity / (1 + moistureContent / 100)" },
      { step: "calc_compaction", formula: "compactionDegree = (dryDensity / maxDryDensity) * 100" },
    ],
    {
      massHoleSand: 1980,
      volumeSand: 1000,
      moistureContent: 5,
      maxDryDensity: 1.95,
    },
  );

  assert.equal(outputs.outputs.wetDensity, 1.98);
  assert.equal(outputs.outputs.compactionDegree, 96.7026);
  assert.equal(outputs.trace.length, 3);
});

test("executeRules returns the overall gate result", () => {
  const gate = executeRules(
    [
      {
        ruleId: "RULE-COMPACTION-001",
        field: "compactionDegree",
        operator: ">=",
        value: 93,
        message: "鍘嬪疄搴﹀繀椤?鈮?93%",
      },
    ],
    {
      compactionDegree: 96.7026,
    },
  );

  assert.equal(gate.passed, true);
  assert.equal(gate.results[0]?.actual, 96.7026);
});

test("submitNode remains a wrapper and leaves node in SIGNING", () => {
  const loader = new SPULoader();
  const spu = loader.load(yamlContent);
  const node = createNode(spu.spuId);

  const updatedNode = submitNode(node, passInputs());

  assert.equal(updatedNode.status, "SIGNING");
  assert.equal(updatedNode.execution_result?.compactionDegree, 96.7026);
  assert.equal(updatedNode.gate_result?.passed, true);
  assert.ok(updatedNode.proof);
  assert.equal(updatedNode.proof?.status, "FINAL_PASS");
  assert.deepEqual(updatedNode.proof?.pendingSignatures, ["lab", "supervision"]);
});

test("thickness YAML follows the runtime lifecycle without changing semantics", () => {
  const loader = new SPULoader();
  const spu = loader.load(thicknessYaml);
  const node = createNode(spu.spuId);
  const updatedNode = submitNode(node, {
    measuredThickness: 210,
    designThickness: 200,
  });

  assert.equal(updatedNode.status, "SIGNING");
  assert.equal(updatedNode.execution_result?.thicknessValue, 210);
  assert.equal(updatedNode.execution_result?.thicknessDeviation, 10);
  assert.equal(updatedNode.gate_result?.passed, true);
  assert.equal(updatedNode.proof?.result.value, 210);
});

test("deflection YAML resolves rule thresholds from inputs for PASS and FAIL", () => {
  const loader = new SPULoader();
  const spu = loader.load(deflectionYaml);

  const passNode = submitNode(createNode(spu.spuId), {
    measuredDeflection: 18,
    maxAllowedDeflection: 20,
  });
  const failNode = submitNode(createNode(spu.spuId), {
    measuredDeflection: 22,
    maxAllowedDeflection: 20,
  });

  assert.equal(passNode.execution_result?.deflectionValue, 18);
  assert.equal(passNode.gate_result?.passed, true);
  assert.equal(passNode.gate_result?.results[0]?.expected, 20);
  assert.equal(failNode.execution_result?.deflectionValue, 22);
  assert.equal(failNode.gate_result?.passed, false);
  assert.equal(failNode.gate_result?.results[0]?.expected, 20);
});

