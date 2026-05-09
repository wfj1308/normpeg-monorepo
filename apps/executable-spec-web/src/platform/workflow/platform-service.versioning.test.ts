import assert from "node:assert/strict";
import test from "node:test";

import type { SPUDefinition } from "../types.ts";
import { PlatformService } from "./platform-service.ts";

const SPU_KEY = "demo.subgrade.compaction";
const SPU_V1 = `${SPU_KEY}@v1`;
const SPU_V2 = `${SPU_KEY}@v2`;

function buildSpu(spuId: string, version: string, threshold: number): SPUDefinition {
  return {
    spuId,
    meta: {
      name: "Demo Compaction",
      norm: "DEMO-NORM",
      clause: "1.0.0",
      version,
      measuredItem: "compaction",
    },
    data: {
      inputs: [{ name: "value", type: "number", label: "Value" }],
      outputs: [{ name: "result", label: "Result" }],
    },
    path: [{ step: "s1", formula: "result = value" }],
    rules: [
      {
        ruleId: "RULE-1",
        field: "result",
        operator: ">=",
        threshold,
        message: "result should pass",
      },
    ],
    proof: {
      resultField: "result",
      requiredSignatures: [],
    },
    sourceType: "compiled",
  };
}

function createContainerAt(service: PlatformService, station: string, projectId?: string) {
  const slot = service.importSlot({
    station,
    chainage: Number(station.replace("K", "").replace("+", "")),
    x: 1,
    y: 2,
    elevation: 3,
    sourceFile: "versioning-test.csv",
  });
  return service.createContainer({
    projectId,
    geoSlotRef: slot.slotId,
    autoBindSpuKeys: [SPU_KEY],
  });
}

test("versioning: same SPU key can keep v1 and v2 together", () => {
  const service = new PlatformService();
  service.publishSpuVersion(buildSpu(SPU_V1, "v1", 90));
  service.publishSpuVersion(buildSpu(SPU_V2, "v2", 95));

  const records = service.listSpuVersionRecords(SPU_KEY);
  assert.equal(records.length, 2);
  assert.equal(records.some((item) => item.spuId === SPU_V1), true);
  assert.equal(records.some((item) => item.spuId === SPU_V2), true);
  assert.equal(records.some((item) => item.spuId === SPU_V2 && item.isLatest), true);
});

test("versioning: project binding controls effective execution version and supports rollback", () => {
  const service = new PlatformService();
  service.publishSpuVersion(buildSpu(SPU_V1, "v1", 90));
  service.publishSpuVersion(buildSpu(SPU_V2, "v2", 95));

  const projectId = "project-alpha";
  const bindV1 = service.bindProjectSpuVersion({
    projectId,
    spuKey: SPU_KEY,
    selector: { version: "v1" },
    note: "initial binding",
  });
  assert.equal(bindV1.activeSpuId, SPU_V1);

  const container = createContainerAt(service, "K01+001", projectId);
  const bound = container.specBindings.find((item) => item.spuKey === SPU_KEY) ?? null;
  assert.ok(bound);
  assert.equal(bound?.spuId, SPU_V1);
  assert.equal(service.getCurrentEffectiveVersion(projectId, SPU_KEY)?.spuId, SPU_V1);

  const node = service.createNodeByKey({
    containerId: container.containerId,
    spuKey: SPU_KEY,
    projectId,
  });
  assert.equal(node.spuId, SPU_V1);

  const rollback = service.rollbackProjectSpuVersion({
    projectId,
    spuKey: SPU_KEY,
    targetVersion: "v2",
    note: "rollback to v2",
  });
  assert.equal(rollback.activeSpuId, SPU_V2);
  assert.equal(service.getCurrentEffectiveVersion(projectId, SPU_KEY)?.spuId, SPU_V2);
});

test("versioning: unbound project falls back to latest version", () => {
  const service = new PlatformService();
  service.publishSpuVersion(buildSpu(SPU_V1, "v1", 90));
  service.publishSpuVersion(buildSpu(SPU_V2, "v2", 95));

  const container = createContainerAt(service, "K01+002");
  const bound = container.specBindings.find((item) => item.spuKey === SPU_KEY) ?? null;
  assert.ok(bound);
  assert.equal(bound?.spuId, SPU_V2);
});

test("project context: project list/detail includes bindings and active containers", () => {
  const service = new PlatformService();
  service.publishSpuVersion(buildSpu(SPU_V1, "v1", 90));
  service.publishSpuVersion(buildSpu(SPU_V2, "v2", 95));

  const alphaProjectId = "project-alpha";
  const betaProjectId = "project-beta";

  service.bindProjectSpuVersion({
    projectId: alphaProjectId,
    spuKey: SPU_KEY,
    selector: { version: "v1" },
  });
  service.bindProjectSpuVersion({
    projectId: betaProjectId,
    spuKey: SPU_KEY,
    selector: { version: "v2" },
  });

  const alphaContainer = createContainerAt(service, "K01+101", alphaProjectId);
  const betaContainer = createContainerAt(service, "K01+102", betaProjectId);
  service.upsertProjectContext({
    projectId: alphaProjectId,
    overrides: {
      global: {
        inspector: "alpha-lab",
      },
    },
  });

  const alphaContext = service.getProjectContext(alphaProjectId);
  assert.ok(alphaContext);
  assert.equal(alphaContext?.boundSpuVersions.length, 1);
  assert.equal(alphaContext?.boundSpuVersions[0]?.activeSpuId, SPU_V1);
  assert.equal(alphaContext?.activeContainers.includes(alphaContainer.containerId), true);
  assert.equal(alphaContext?.overrides.global.inspector, "alpha-lab");

  const betaContext = service.getProjectContext(betaProjectId);
  assert.ok(betaContext);
  assert.equal(betaContext?.boundSpuVersions[0]?.activeSpuId, SPU_V2);
  assert.equal(betaContext?.activeContainers.includes(betaContainer.containerId), true);

  const projects = service.listProjectContexts();
  assert.equal(projects.some((item) => item.projectId === alphaProjectId), true);
  assert.equal(projects.some((item) => item.projectId === betaProjectId), true);
});

test("project context: execution resolves bound version and applies overrides first", () => {
  const service = new PlatformService();
  service.publishSpuVersion(buildSpu(SPU_V1, "v1", 90));
  service.publishSpuVersion(buildSpu(SPU_V2, "v2", 95));

  const projectId = "project-override";
  service.bindProjectSpuVersion({
    projectId,
    spuKey: SPU_KEY,
    selector: { version: "v2" },
  });
  service.upsertProjectContext({
    projectId,
    overrides: {
      bySpuId: {
        [SPU_V2]: {
          value: 97,
        },
      },
    },
  });

  const effectiveSpuId = service.resolveProjectExecutionSpuId(projectId, SPU_V1);
  assert.equal(effectiveSpuId, SPU_V2);

  const merged = service.resolveProjectExecutionInputs({
    projectId,
    spuId: SPU_V2,
    inputs: { value: 91 },
  });
  assert.equal(merged.mergedInputs.value, 97);
  assert.equal(merged.appliedOverrideKeys.includes("value"), true);
});
