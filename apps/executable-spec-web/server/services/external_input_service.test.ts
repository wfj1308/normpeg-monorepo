import assert from "node:assert/strict";
import test from "node:test";

import type { SPUDefinition } from "../../src/platform/types.ts";
import { PlatformService } from "../../src/platform/workflow/platform-service.ts";
import { evaluateGateRequest } from "./gate_evaluate_service.ts";
import {
  buildExternalInputValidationStatus,
  normalizeExternalInputMappingRules,
  normalizeJsonImportRecords,
  parseCsvImportRecords,
} from "./external_input_service.ts";

function buildDemoSpu(spuId: string): SPUDefinition {
  return {
    spuId,
    meta: {
      name: "External Input Demo",
      norm: "DEMO-NORM",
      clause: "9.9.9",
      version: "v1",
    },
    data: {
      inputs: [
        { name: "value", type: "number", label: "Value" },
        { name: "threshold", type: "number", label: "Threshold" },
      ],
      outputs: [{ name: "result", label: "Result" }],
    },
    path: [{ step: "s1", formula: "result = value" }],
    rules: [
      {
        ruleId: "RULE-1",
        field: "result",
        operator: ">=",
        threshold: {
          inputRef: "threshold",
        },
        message: "result must pass threshold",
      },
    ],
    proof: {
      resultField: "result",
      requiredSignatures: [],
    },
    sourceType: "compiled",
  };
}

test("external input service: should parse CSV and validate mapping rules", () => {
  const mappingRules = normalizeExternalInputMappingRules([
    {
      sourceField: "ext_value",
      targetInput: "value",
      typeHint: "number",
      required: true,
    },
    {
      sourceField: "ext_threshold",
      targetInput: "threshold",
      typeHint: "number",
      required: true,
    },
  ]);
  const records = parseCsvImportRecords("ext_value,ext_threshold\n95.5,90\n");
  const validation = buildExternalInputValidationStatus({
    mappingRules,
    records,
  });

  assert.equal(records.length, 1);
  assert.deepEqual(Object.keys(records[0] ?? {}).sort((a, b) => a.localeCompare(b)), ["ext_threshold", "ext_value"]);
  assert.equal(validation.status, "valid");
  assert.deepEqual(validation.errors, []);
});

test("external input service: should normalize JSON API payload records", () => {
  const records = normalizeJsonImportRecords({
    items: [
      { ext_value: 98, ext_threshold: 90 },
      { ext_value: 88, ext_threshold: 90 },
    ],
  });
  assert.equal(records.length, 2);
  assert.equal(records[0]?.ext_value, 98);
});

test("external input service: imported external source should map to SPU.inputs and still run Gate/Proof chain", () => {
  const service = new PlatformService();
  const spuId = "demo.external.input@v1";
  service.publishSpuVersion(buildDemoSpu(spuId));

  const slot = service.importSlot({
    station: "K19+090",
    chainage: 19090,
    x: 1,
    y: 2,
    elevation: 3,
    sourceFile: "external-input-test.csv",
  });
  const container = service.createContainer({
    geoSlotRef: slot.slotId,
    autoBindSpuIds: [spuId],
  });

  const mappingRules = normalizeExternalInputMappingRules([
    { sourceField: "ext_value", targetInput: "value", typeHint: "number", required: true },
    { sourceField: "ext_threshold", targetInput: "threshold", typeHint: "number", required: true },
  ]);
  const records = parseCsvImportRecords("ext_value,ext_threshold\n95.5,90\n");
  service.upsertExternalInputSource({
    sourceId: "source-demo",
    sourceType: "csv",
    mappingRules,
    validationStatus: buildExternalInputValidationStatus({ mappingRules, records }),
    records,
    sourceRef: "manual-upload.csv",
  });

  const mapped = service.resolveExternalSourceInputs({
    sourceId: "source-demo",
    spuId,
    recordIndex: 0,
  });
  assert.equal(mapped.mappedInputs.value, 95.5);
  assert.equal(mapped.mappedInputs.threshold, 90);
  assert.deepEqual(mapped.missingInputs, []);

  const gate = evaluateGateRequest(service, {
    containerId: container.containerId,
    spuId,
    inputs: mapped.mappedInputs,
  });
  assert.equal(gate.status, "PASS");
  assert.equal(gate.spuId, spuId);
  assert.equal(gate.proofFragment.kind, "proofFragment");
});
