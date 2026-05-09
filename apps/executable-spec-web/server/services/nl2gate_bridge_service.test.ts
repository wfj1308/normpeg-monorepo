import assert from "node:assert/strict";
import test from "node:test";

import type { SPUDefinition } from "../../src/platform/types.ts";
import { PlatformService } from "../../src/platform/workflow/platform-service.ts";
import { queryNl2Gate } from "./nl2gate_bridge_service.ts";

function buildProjectSpu(spuId: string, version: string, threshold: number): SPUDefinition {
  return {
    spuId,
    meta: {
      name: "Selector Project SPU",
      norm: "DEMO-NORM",
      clause: "4.2.1",
      version,
      category: "路基",
      measuredItem: "压实度",
    },
    data: {
      inputs: [
        { name: "massHoleSand", type: "number", label: "massHoleSand" },
        { name: "massSandCone", type: "number", label: "massSandCone" },
        { name: "volumeSand", type: "number", label: "volumeSand" },
        { name: "moistureContent", type: "number", label: "moistureContent" },
        { name: "maxDryDensity", type: "number", label: "maxDryDensity" },
      ],
      outputs: [{ name: "compactionDegree", label: "compactionDegree" }],
    },
    path: [
      {
        step: "s1",
        formula: "compactionDegree = (massHoleSand - massSandCone) / volumeSand / (1 + moistureContent / 100) / maxDryDensity * 100",
      },
    ],
    rules: [{
      ruleId: "R1",
      field: "compactionDegree",
      operator: ">=",
      threshold,
      message: "compactionDegree should pass",
    }],
    proof: {
      resultField: "compactionDegree",
      requiredSignatures: [],
    },
    sourceType: "compiled",
  };
}

test("queryNl2Gate: controlled parse should return structured intent/target/inputs", () => {
  const service = new PlatformService();
  const result = queryNl2Gate(service, "K15+200 压实度合格吗？", { mode: "preview" });

  assert.equal(result.success, true);
  assert.equal(result.structured.intent, "gate.preview");
  assert.equal(result.structured.target.metric, "compaction");
  assert.equal(result.structured.target.stake, "K15+200");
  assert.ok(result.structured.target.spuId);
  assert.ok(result.structured.spuCandidates.length > 0);
  assert.equal(result.structured.missing.length, 0);
  assert.equal(result.command?.action, "validate_spu_direct");
  assert.equal(result.command?.endpoint, "/api/gate/preview");
  assert.ok(result.execution?.status === "PASS" || result.execution?.status === "FAIL");
});

test("queryNl2Gate: evaluate intent should be explicitly mapped", () => {
  const service = new PlatformService();
  const result = queryNl2Gate(service, "请正式执行 K15+200 压实度判定", { mode: "evaluate" });

  assert.equal(result.success, true);
  assert.equal(result.structured.intent, "gate.evaluate");
  assert.equal(result.command?.endpoint, "/api/gate/evaluate");
  assert.equal(result.execution?.intent, "gate.evaluate");
});

test("queryNl2Gate: rule_store mode should parse only and never execute local registry rules", () => {
  const service = new PlatformService();
  const result = queryNl2Gate(service, "请正式执行 K15+200 压实度判定", {
    mode: "evaluate",
    matchSource: "rule_store",
  });

  assert.equal(result.success, true);
  assert.equal(result.structured.intent, "gate.evaluate");
  assert.equal(result.structured.target.metric, "compaction");
  assert.equal(result.structured.target.stake, "K15+200");
  assert.equal(result.structured.target.spuId, null);
  assert.equal(result.command, null);
  assert.equal(result.execution, null);
  assert.equal(result.structured.command, null);
  assert.equal(result.structured.execution, null);
  assert.equal(service.listExecutionLogs().length, 0);
});

test("queryNl2Gate: missing stake should return structured missing items", () => {
  const service = new PlatformService();
  const result = queryNl2Gate(service, "压实度合格吗？");

  assert.equal(result.success, false);
  assert.equal(result.errorCode, "MISSING_STAKE");
  assert.ok(result.structured.missing.some((item) => item.field === "target.stake"));
  assert.ok(result.structured.spuCandidates.length > 0);
  assert.equal(result.structured.command, null);
  assert.equal(result.structured.execution, null);
  assert.ok(result.structured.missingResponse);
  assert.ok(result.structured.conversation?.conversationId);
});

test("queryNl2Gate: unknown stake should return structured missing for inputs", () => {
  const service = new PlatformService();
  const result = queryNl2Gate(service, "K99+999 厚度合格吗？");

  assert.equal(result.success, false);
  assert.equal(result.errorCode, "DATA_NOT_FOUND");
  assert.ok(result.structured.missing.some((item) => item.field === "inputs"));
  assert.ok(result.structured.spuCandidates.length > 0);
  assert.equal(result.structured.command, null);
  assert.equal(result.structured.execution, null);
});

test("queryNl2Gate: explicit context inputs should avoid data guessing", () => {
  const service = new PlatformService();
  const result = queryNl2Gate(service, "K99+999 压实度预演", {
    mode: "preview",
    context: {
      inputs: {
        massHoleSand: 1980,
        massSandCone: 500,
        volumeSand: 1000,
        moistureContent: 5,
        maxDryDensity: 1.95,
      },
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.structured.intent, "gate.preview");
  assert.equal(result.structured.target.stake, "K99+999");
  assert.deepEqual(result.structured.inputs, {
    massHoleSand: 1980,
    massSandCone: 500,
    volumeSand: 1000,
    moistureContent: 5,
    maxDryDensity: 1.95,
  });
  assert.equal(result.command?.endpoint, "/api/gate/preview");
  assert.ok(result.execution?.executionId);
  assert.ok(result.structured.spuCandidates.length > 0);
});

test("queryNl2Gate: unsupported metric should return structured missing target.metric", () => {
  const service = new PlatformService();
  const result = queryNl2Gate(service, "K15+200 平整度怎么样？", { mode: "preview" });

  assert.equal(result.success, false);
  assert.equal(result.errorCode, "UNSUPPORTED_METRIC");
  assert.ok(result.structured.missing.some((item) => item.field === "target.metric"));
  assert.equal(result.structured.command, null);
  assert.equal(result.structured.execution, null);
});

test("queryNl2Gate: free-chat query should not bypass structured gate contract", () => {
  const service = new PlatformService();
  const result = queryNl2Gate(service, "今天施工质量怎么样，随便聊聊");

  assert.equal(result.success, false);
  assert.ok(result.structured.missing.some((item) => item.field === "target.metric"));
  assert.ok(result.structured.missing.some((item) => item.field === "target.stake"));
  assert.ok(result.structured.spuCandidates.length > 0);
  assert.equal(result.structured.command, null);
  assert.equal(result.structured.execution, null);
});

test("queryNl2Gate: missing inputs should return follow-up questions without executing Gate", () => {
  const service = new PlatformService();
  const result = queryNl2Gate(service, "K99+999 压实度预演 massHoleSand=1980 massSandCone=500 volumeSand=1000 moistureContent=5");

  assert.equal(result.success, false);
  assert.ok(result.structured.missing.some((item) => item.field === "inputs.maxDryDensity"));
  assert.ok(result.structured.missingResponse);
  assert.ok((result.structured.missingResponse?.suggestedQuestions.length ?? 0) > 0);
  assert.ok(result.structured.spuCandidates.length > 0);
  assert.ok(result.structured.conversation?.conversationId);
  assert.equal(result.structured.execution, null);
  assert.equal(service.listExecutionLogs().length, 0);
});

test("queryNl2Gate: second turn should resume conversation and execute after parameters are complete", () => {
  const service = new PlatformService();
  const firstRound = queryNl2Gate(
    service,
    "K99+999 压实度预演 massHoleSand=1980 massSandCone=500 volumeSand=1000 moistureContent=5",
  );
  const conversationId = firstRound.structured.conversation?.conversationId ?? "";

  assert.ok(conversationId);
  assert.equal(service.listExecutionLogs().length, 0);

  const secondRound = queryNl2Gate(service, "maxDryDensity=1.95", {
    conversationId,
  });

  assert.equal(secondRound.success, true);
  assert.equal(secondRound.structured.missing.length, 0);
  assert.equal(secondRound.structured.missingResponse, null);
  assert.ok(secondRound.structured.spuCandidates.length > 0);
  assert.ok(secondRound.execution?.executionId);
  assert.equal(secondRound.structured.conversation?.conversationId, conversationId);
  assert.equal(secondRound.structured.conversation?.pendingIntent, null);
  assert.equal(secondRound.structured.conversation?.pendingSpu, null);
  assert.equal(service.listExecutionLogs().length, 1);
});

test("queryNl2Gate: should prefer project-bound spu from selector candidates", () => {
  const service = new PlatformService();
  const spuKey = "demo.selector.project.compaction";
  const spuV1 = buildProjectSpu(`${spuKey}@v1`, "v1", 90);
  const spuV2 = buildProjectSpu(`${spuKey}@v2`, "v2", 95);
  service.publishSpuVersion(spuV1);
  service.publishSpuVersion(spuV2);
  service.bindProjectSpuVersion({
    projectId: "project-selector-alpha",
    spuKey,
    selector: { version: "v1" },
  });

  const result = queryNl2Gate(service, "K99+999 压实度预演", {
    mode: "preview",
    context: {
      projectId: "project-selector-alpha",
      inputs: {
        massHoleSand: 1980,
        massSandCone: 500,
        volumeSand: 1000,
        moistureContent: 5,
        maxDryDensity: 1.95,
      },
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.structured.target.spuId, `${spuKey}@v1`);
  assert.equal(result.structured.spuCandidates[0]?.spuId, `${spuKey}@v1`);
  assert.equal(
    result.structured.spuCandidates[0]?.matchReasons.some((reason) => reason.includes("project-bound active")),
    true,
  );
});
