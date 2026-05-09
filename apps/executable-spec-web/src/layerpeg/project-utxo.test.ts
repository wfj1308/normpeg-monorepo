import assert from "node:assert/strict";
import test from "node:test";

import {
  addOutput,
  buildVAddress,
  consumeOutput,
  createProjectUTXO,
  getUnspentOutputs,
  parseVAddress,
  resolveVAddress,
  type UTXOOutput,
} from "./project-utxo.ts";

function buildOutput(overrides: Partial<UTXOOutput> = {}): UTXOOutput {
  return {
    utxo_id: "utxo_001",
    v_address: "v://GXX-2024-XXX/K15+200",
    type: "ComponentExecution",
    state: "QUALIFIED",
    payload: { compaction_degree: 96.2, result: "PASS" },
    created_at: "2026-04-16T10:00:00Z",
    consumed: false,
    ...overrides,
  };
}

test("createProjectUTXO should normalize id and initialize empty outputs", () => {
  const projectUTXO = createProjectUTXO("GXX-2024-XXX");

  assert.equal(projectUTXO.id, "v://GXX-2024-XXX");
  assert.equal(projectUTXO.current_state, "DRAFT");
  assert.deepEqual(projectUTXO.unspent_outputs, {});
  assert.equal(typeof projectUTXO.genesis, "string");
});

test("addOutput should append output and update current_state", () => {
  const projectUTXO = createProjectUTXO("GXX-2024-XXX");
  const appended = addOutput(projectUTXO, buildOutput());

  assert.equal(Object.keys(projectUTXO.unspent_outputs).length, 0);
  assert.equal(Object.keys(appended.unspent_outputs).length, 1);
  assert.equal(appended.current_state, "QUALIFIED");
  assert.deepEqual(appended.unspent_outputs.utxo_001.payload, { compaction_degree: 96.2, result: "PASS" });
});

test("consumeOutput should mark target output as consumed", () => {
  const projectUTXO = addOutput(createProjectUTXO("GXX-2024-XXX"), buildOutput());
  const consumed = consumeOutput(projectUTXO, "utxo_001");

  assert.equal(projectUTXO.unspent_outputs.utxo_001.consumed, false);
  assert.equal(consumed.unspent_outputs.utxo_001.consumed, true);
});

test("consumeOutput should reject consuming an already consumed output", () => {
  const projectUTXO = addOutput(createProjectUTXO("GXX-2024-XXX"), buildOutput());
  const consumed = consumeOutput(projectUTXO, "utxo_001");

  assert.throws(() => consumeOutput(consumed, "utxo_001"), /already consumed/i);
});

test("getUnspentOutputs should only return outputs with consumed=false", () => {
  let projectUTXO = createProjectUTXO("GXX-2024-XXX");
  projectUTXO = addOutput(projectUTXO, buildOutput({ utxo_id: "utxo_001" }));
  projectUTXO = addOutput(projectUTXO, buildOutput({ utxo_id: "utxo_002", state: "REJECTED" }));
  projectUTXO = consumeOutput(projectUTXO, "utxo_001");

  const unspent = getUnspentOutputs(projectUTXO);

  assert.equal(unspent.length, 1);
  assert.equal(unspent[0].utxo_id, "utxo_002");
  assert.equal(unspent[0].consumed, false);
});

test("buildVAddress + parseVAddress should round-trip values", () => {
  const vAddress = buildVAddress({
    projectId: "GXX-2024-XXX",
    stake: "K15+200",
    layer: "subgrade",
    timestamp: 1713196800,
  });
  const parsed = parseVAddress(vAddress);

  assert.equal(vAddress, "v://GXX-2024-XXX/K15+200?layer=subgrade&time=1713196800");
  assert.equal(parsed.projectId, "GXX-2024-XXX");
  assert.equal(parsed.stake, "K15+200");
  assert.equal(parsed.layer, "subgrade");
  assert.equal(parsed.timestamp, 1713196800);
});

test("resolveVAddress should follow default/timestamp/version filtering rules", () => {
  let projectUTXO = createProjectUTXO("GXX-2024-XXX");
  projectUTXO = addOutput(
    projectUTXO,
    buildOutput({
      utxo_id: "utxo_old",
      v_address: buildVAddress({
        projectId: "GXX-2024-XXX",
        stake: "K15+200",
        layer: "subgrade",
        timestamp: 1713196800,
      }),
      payload: { version: "hash_old", proof_hash: "hash_old" },
      created_at: "2026-04-16T10:00:00Z",
    }),
  );
  projectUTXO = consumeOutput(projectUTXO, "utxo_old");
  projectUTXO = addOutput(
    projectUTXO,
    buildOutput({
      utxo_id: "utxo_latest",
      v_address: buildVAddress({
        projectId: "GXX-2024-XXX",
        stake: "K15+200",
        layer: "subgrade",
        timestamp: 1713200400,
      }),
      payload: { version: "hash_new", proof_hash: "hash_new" },
      created_at: "2026-04-16T11:00:00Z",
    }),
  );
  projectUTXO = addOutput(
    projectUTXO,
    buildOutput({
      utxo_id: "utxo_other_stake",
      v_address: buildVAddress({
        projectId: "GXX-2024-XXX",
        stake: "K20+100",
        layer: "subgrade",
        timestamp: 1713200400,
      }),
    }),
  );

  const defaultItems = resolveVAddress(projectUTXO, "v://GXX-2024-XXX/K15+200");
  const byTimestamp = resolveVAddress(projectUTXO, "v://GXX-2024-XXX/K15+200?time=1713197000");
  const byVersion = resolveVAddress(projectUTXO, "v://GXX-2024-XXX/K15+200?version=hash_old");

  assert.equal(defaultItems.length, 1);
  assert.equal(defaultItems[0].utxo_id, "utxo_latest");
  assert.equal(byTimestamp.length, 1);
  assert.equal(byTimestamp[0].utxo_id, "utxo_old");
  assert.equal(byVersion.length, 1);
  assert.equal(byVersion[0].utxo_id, "utxo_old");
});
