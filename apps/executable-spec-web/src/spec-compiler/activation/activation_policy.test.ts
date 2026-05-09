import assert from "node:assert/strict";
import test from "node:test";

import {
  createActivationPolicy,
  deriveSpuKey,
  findLatestSpuVersion,
  resolveActiveSpuForNewContainer,
  resolveApplicableSpuForExistingContainer,
  type SpuActivationPolicy,
} from "./index.ts";
import type { RunningContainer } from "../impact/index.ts";

const SPU_V1 = "highway.subgrade.compaction.4.2.1.soil@v1";
const SPU_V2 = "highway.subgrade.compaction.4.2.1.soil@v2";

function buildContainer(containerId: string, status: "blocked" | "ready" | "running" | "pass" | "fail"): RunningContainer {
  return {
    containerId,
    lifecycleState: "active",
    normExecution: {
      applicableSpecs: [
        {
          spuId: SPU_V1,
          status,
          latestNode: null,
        },
      ],
    },
  };
}

test("deriveSpuKey: 去除版本后缀", () => {
  assert.equal(deriveSpuKey(SPU_V1), "highway.subgrade.compaction.4.2.1.soil");
});

test("findLatestSpuVersion: 返回同族最新版本", () => {
  const latest = findLatestSpuVersion([{ spuId: SPU_V1 }, { spuId: SPU_V2 }], deriveSpuKey(SPU_V2));
  assert.equal(latest?.spuId, SPU_V2);
});

test("场景1：new_containers_only，新建容器默认 v2，运行中容器保持 v1", () => {
  const spuKey = deriveSpuKey(SPU_V2);
  const policy = createActivationPolicy(SPU_V1, SPU_V2, "new_containers_only");
  const activeForNew = resolveActiveSpuForNewContainer(spuKey, [policy], [{ spuId: SPU_V1 }, { spuId: SPU_V2 }]);
  assert.equal(activeForNew, SPU_V2);

  const runningContainer = buildContainer("K19+070", "running");
  const decision = resolveApplicableSpuForExistingContainer(runningContainer, spuKey, [policy], [{ spuId: SPU_V1 }, { spuId: SPU_V2 }]);
  assert.equal(decision.shouldSwitch, false);
  assert.equal(decision.recommendedSpuId, SPU_V1);
});

test("场景2：manual，新建容器仍默认 v1", () => {
  const spuKey = deriveSpuKey(SPU_V2);
  const policy = createActivationPolicy(SPU_V1, SPU_V2, "manual");
  const activeForNew = resolveActiveSpuForNewContainer(spuKey, [policy], [{ spuId: SPU_V1 }, { spuId: SPU_V2 }]);
  assert.equal(activeForNew, SPU_V1);
});

test("场景3：future_tasks_only，ready 任务标记 shouldSwitch=true", () => {
  const spuKey = deriveSpuKey(SPU_V2);
  const policies: SpuActivationPolicy[] = [createActivationPolicy(SPU_V1, SPU_V2, "future_tasks_only")];
  const container: RunningContainer = {
    containerId: "K19+080",
    lifecycleState: "draft",
    normExecution: {
      applicableSpecs: [{ spuId: SPU_V1, status: "ready", latestNode: null }],
    },
  };
  const decision = resolveApplicableSpuForExistingContainer(container, spuKey, policies, [{ spuId: SPU_V1 }, { spuId: SPU_V2 }]);
  assert.equal(decision.recommendedSpuId, SPU_V2);
  assert.equal(decision.shouldSwitch, true);
});
