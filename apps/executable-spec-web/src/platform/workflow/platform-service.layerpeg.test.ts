import assert from "node:assert/strict";
import test from "node:test";

import { layerPegFromSpu } from "../../layerpeg/transformer.ts";
import { PlatformService } from "./platform-service.ts";

test("evaluateSpuDirect should return FINAL_PASS for valid compaction inputs", () => {
  const service = new PlatformService();
  const node = service.evaluateSpuDirect({
    spuId: "highway.subgrade.compaction.4.2.1@v1",
    inputs: {
      massHoleSand: 1980,
      massSandCone: 200,
      volumeSand: 1000,
      moistureContent: 5,
      maxDryDensity: 1.95,
    },
    autoSign: true,
  });

  assert.equal(node.status, "FINAL_PASS");
  assert.equal(node.gate.passed, true);
});

test("LayerPeg document ledger should upsert and query records", () => {
  const service = new PlatformService();
  const spu = service.getRegistry()[0];
  assert.ok(spu);
  const doc = layerPegFromSpu(spu);
  const saved = service.upsertLayerPegDocument(doc, `spec:${spu.spuId}`);
  assert.equal(saved.usi, doc.header.usi);

  const fetched = service.getLayerPegDocument(doc.header.usi);
  assert.ok(fetched);
  assert.equal(fetched?.sourceRef, `spec:${spu.spuId}`);

  const listed = service.listLayerPegDocuments({ docType: "spec" });
  assert.equal(listed.length >= 1, true);
});
