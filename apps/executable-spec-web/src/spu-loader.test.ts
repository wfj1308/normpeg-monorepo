import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { SPULoader } from "./spu-loader.ts";
import { SPU_EXAMPLES } from "./spu-examples.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const yamlPath = resolve(currentDir, "./subgrade.compaction.spu.yaml");
const yamlContent = readFileSync(yamlPath, "utf-8");

function createLoader(): SPULoader {
  return new SPULoader();
}

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
    massHoleSand: 1500,
    massSandCone: 500,
    volumeSand: 1000,
    moistureContent: 12,
    maxDryDensity: 1.95,
  };
}

test("YAML can be loaded successfully", () => {
  const loader = createLoader();
  const spu = loader.load(yamlContent);

  assert.equal(spu.spuId, "highway.subgrade.compaction.4.2.1.soil@v1");
  assert.equal(spu.meta.name, "Subgrade Compaction (Soil)");
});

test("missing spuId throws", () => {
  const loader = createLoader();

  assert.throws(
    () =>
      loader.load(`
meta:
  name: test
forms:
  - formCode: A
    role: lab
    required: true
data:
  inputs: []
  outputs: []
path:
  - step: s1
    formula: "x = 1"
rules: []
proof:
  resultField: x
  passMessage: ok
  failMessage: fail
  requiredSignatures: []
`),
    /spuId is required/,
  );
});

test("missing forms throws", () => {
  const loader = createLoader();

  assert.throws(
    () =>
      loader.load(`
spuId: test
meta:
  name: test
  norm: n
  clause: c
  version: v1
data:
  inputs: []
  outputs: []
path:
  - step: s1
    formula: "x = 1"
rules: []
proof:
  resultField: x
  passMessage: ok
  failMessage: fail
  requiredSignatures: []
`),
    /forms is required/,
  );
});

test("missing path throws", () => {
  const loader = createLoader();

  assert.throws(
    () =>
      loader.load(`
spuId: test
meta:
  name: test
  norm: n
  clause: c
  version: v1
forms:
  - formCode: A
    role: lab
    required: true
data:
  inputs: []
  outputs: []
rules: []
proof:
  resultField: x
  passMessage: ok
  failMessage: fail
  requiredSignatures: []
`),
    /path is required/,
  );
});

test("missing required input throws", () => {
  const loader = createLoader();
  const spu = loader.load(yamlContent);

  assert.throws(
    () =>
      loader.execute(spu.spuId, {
        massHoleSand: 1980,
        volumeSand: 1000,
        moistureContent: 5,
        maxDryDensity: 1.95,
      }),
    /missing required input: massSandCone/,
  );
});

test("PASS scenario executes successfully", () => {
  const loader = createLoader();
  const spu = loader.load(yamlContent);
  const result = loader.execute(spu.spuId, passInputs());

  assert.equal(result.status, "PASS");
});

test("FAIL scenario executes successfully", () => {
  const loader = createLoader();
  const spu = loader.load(yamlContent);
  const result = loader.execute(spu.spuId, failInputs());

  assert.equal(result.status, "FAIL");
});

test("proof payload is complete", () => {
  const loader = createLoader();
  const spu = loader.load(yamlContent);
  const result = loader.execute(spu.spuId, passInputs());

  assert.equal(result.proof.spuId, spu.spuId);
  assert.equal(result.proof.norm, "JTG F80/1-2017");
  assert.equal(result.proof.clause, "4.2.1");
  assert.equal(result.proof.result.field, "compactionDegree");
  assert.deepEqual(result.proof.requiredSignatures, ["lab", "supervision"]);
  assert.deepEqual(result.proof.pendingSignatures, ["lab", "supervision"]);
});

test("outputs include wetDensity / dryDensity / compactionDegree", () => {
  const loader = createLoader();
  const spu = loader.load(yamlContent);
  const result = loader.execute(spu.spuId, passInputs());

  assert.equal(typeof result.outputs.wetDensity, "number");
  assert.equal(typeof result.outputs.dryDensity, "number");
  assert.equal(typeof result.outputs.compactionDegree, "number");
});

test("second built-in SPU also executes normally", () => {
  const bridgePileStrength = SPU_EXAMPLES.find((item) => item.spu.spuId === "highway.bridge.pile.strength.quality@v1");
  assert.ok(bridgePileStrength);

  const result = createLoader().execute(bridgePileStrength.spu.spuId, bridgePileStrength.passInputs);

  assert.equal(result.status, "PASS");
  assert.equal(result.outputs.pileStrength, 42);
  assert.equal(result.outputs.strengthRatio, 105);
});

test("loader execute supports dynamic rule thresholds sourced from inputs", () => {
  const loader = createLoader();
  const spu = loader.load(`
spuId: "highway.subgrade.deflection.4.2.2@v1"
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
`);

  const passResult = loader.execute(spu.spuId, {
    measuredDeflection: 18,
    maxAllowedDeflection: 20,
  });
  const failResult = loader.execute(spu.spuId, {
    measuredDeflection: 22,
    maxAllowedDeflection: 20,
  });

  assert.equal(passResult.status, "PASS");
  assert.equal(passResult.gateResults[0]?.threshold, 20);
  assert.equal(failResult.status, "FAIL");
  assert.equal(failResult.gateResults[0]?.threshold, 20);
});

