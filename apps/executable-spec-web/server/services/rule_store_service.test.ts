import assert from "node:assert/strict";
import test from "node:test";

import type { SPUDefinition } from "../../src/platform/types.ts";
import { RuleStoreService } from "./rule_store_service.ts";

function buildSpu(params: {
  spuId: string;
  name: string;
  norm: string;
  clause: string;
  version: string;
  clauseIds?: string[];
  sourceType?: SPUDefinition["sourceType"];
}): SPUDefinition {
  return {
    spuId: params.spuId,
    meta: {
      name: params.name,
      norm: params.norm,
      clause: params.clause,
      version: params.version,
      extensions: params.clauseIds ? { clause_ids: params.clauseIds } : undefined,
    },
    forms: [],
    data: {
      inputs: [
        { name: "compaction_degree", type: "number", label: "压实度" },
      ],
      outputs: [
        { name: "result", label: "结果" },
      ],
    },
    path: [],
    rules: [
      {
        ruleId: `${params.spuId}.rule`,
        field: "compaction_degree",
        operator: ">=",
        threshold: 96,
        message: "压实度不满足要求",
      },
    ],
    proof: {
      resultField: "result",
      requiredSignatures: [],
    },
    sourceType: params.sourceType ?? "compiled",
  };
}

test("rule store: white-page list can be published-only", () => {
  const store = new RuleStoreService();
  const spu = buildSpu({
    spuId: "JTG_F80_1_2017.4.2.1.compaction@v1",
    name: "压实度",
    norm: "JTG F80-1-2017",
    clause: "4.2.1",
    version: "v1",
  });
  store.upsertNormDocFromSpus({
    standard_code: "JTG F80-1-2017",
    name: "路基压实度",
    version: "v1",
    status: "draft",
    spuDefinitions: [spu],
  });

  assert.equal(store.listBundles({ statuses: ["published"] }).length, 0);

  const published = store.updateNormDocStatus("JTG F80-1-2017@@v1", {
    status: "published",
    signed_by: "expert.001",
  });
  assert.equal(published.normdoc.status, "published");
  assert.equal(published.normdoc.signed_by, "expert.001");
  assert.equal(store.listBundles({ statuses: ["published"] }).length, 1);
});

test("rule store: sync from registry builds rule version history", () => {
  const store = new RuleStoreService();
  const v1 = buildSpu({
    spuId: "JTG_F80_1_2017.4.2.1.compaction@v1",
    name: "压实度",
    norm: "JTG F80-1-2017",
    clause: "4.2.1",
    version: "v1",
    sourceType: "builtin",
  });
  const v2 = buildSpu({
    spuId: "JTG_F80_1_2017.4.2.1.compaction@v2",
    name: "压实度",
    norm: "JTG F80-1-2017",
    clause: "4.2.1",
    version: "v2",
    sourceType: "builtin",
  });

  store.syncFromRegistry([v1, v2], {
    resolveStatus: () => "published",
  });

  const snapshots = store.listRuleVersionSnapshotsBySpuKey("JTG_F80_1_2017.4.2.1.compaction");
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[0]?.version, "v2");
  assert.equal(snapshots.some((item) => item.isLatest), true);
});

test("rule store: rule item contains clause binding fields", () => {
  const store = new RuleStoreService();
  const first = buildSpu({
    spuId: "demo.rule.binding.compaction@v1",
    name: "压实度",
    norm: "JTG F80-1-2017",
    clause: "4.2.1",
    clauseIds: ["4.2.1", "4.2.2"],
    version: "v1",
  });
  const second = buildSpu({
    spuId: "demo.rule.binding.deflection@v1",
    name: "弯沉",
    norm: "JTG F80-1-2017",
    clause: "4.2.2",
    version: "v1",
  });

  const published = store.upsertNormDocFromSpus({
    normdoc_id: "JTG-F80-1-2017@@v1",
    standard_code: "JTG-F80-1-2017",
    version: "v1",
    status: "published",
    spuDefinitions: [first, second],
  });

  const firstRule = published.ruleItems.find((item) => item.rule_id === first.spuId);
  assert.ok(firstRule, "first rule should exist");
  assert.equal(firstRule?.clause_id, "4.2.1");
  assert.equal(firstRule?.clause_no, "4.2.1");
  assert.deepEqual(firstRule?.clause_ids, ["4.2.1", "4.2.2"]);
  assert.equal(firstRule?.normdoc_id, "JTG-F80-1-2017@@v1");
  assert.equal(firstRule?.rule_version, "v1");
});

test("rule store: publish rejects missing clause references", () => {
  const store = new RuleStoreService();
  const spu = buildSpu({
    spuId: "demo.rule.binding.invalid@v1",
    name: "压实度",
    norm: "JTG F80-1-2017",
    clause: "4.2.1",
    clauseIds: ["4.2.1", "9.9.9"],
    version: "v1",
  });

  assert.throws(
    () => {
      store.upsertNormDocFromSpus({
        normdoc_id: "JTG-F80-1-2017@@v1",
        standard_code: "JTG-F80-1-2017",
        version: "v1",
        status: "published",
        spuDefinitions: [spu],
      });
    },
    /missing clause_id/i,
  );
});
