import assert from "node:assert/strict";
import test from "node:test";

import type { SPUDefinition } from "../types.ts";
import {
  applyCrossDomainProfile,
  DomainAdapterRegistry,
  getSpuCrossDomainProfile,
} from "./domain-adapter.ts";

function createSpu(overrides: Partial<SPUDefinition> = {}): SPUDefinition {
  return {
    spuId: overrides.spuId ?? "manufacturing.dimensional.check@v1",
    meta: {
      name: "Dimension Check",
      norm: "ISO 9001",
      clause: "8.6",
      version: "v1",
      ...(overrides.meta ?? {}),
    },
    data: {
      inputs: [{ name: "value", type: "number", label: "value" }],
      outputs: [{ name: "result", label: "result" }],
      ...(overrides.data ?? {}),
    },
    path: overrides.path ?? [{ step: "s1", formula: "result = value" }],
    rules: overrides.rules ?? [],
    proof: {
      resultField: "result",
      requiredSignatures: [],
      ...(overrides.proof ?? {}),
    },
    sourceType: overrides.sourceType ?? "compiled",
  };
}

test("cross-domain adapter: infer measurement/validation/compliance classification", () => {
  const measurement = getSpuCrossDomainProfile(createSpu({ rules: [] }));
  const validation = getSpuCrossDomainProfile(createSpu({
    rules: [{ field: "result", operator: ">=", threshold: 0, message: "ok" }],
    proof: { resultField: "result", requiredSignatures: [] },
  }));
  const compliance = getSpuCrossDomainProfile(createSpu({
    rules: [{ field: "result", operator: ">=", threshold: 0, message: "ok" }],
    proof: { resultField: "result", requiredSignatures: ["auditor"] },
  }));

  assert.equal(measurement.classification, "measurement");
  assert.equal(validation.classification, "validation");
  assert.equal(compliance.classification, "compliance");
});

test("cross-domain adapter: apply profile should fill domain/classification/tags", () => {
  const normalized = applyCrossDomainProfile(createSpu());
  assert.equal(normalized.meta.domain, "manufacturing");
  assert.equal(normalized.meta.classification, "measurement");
  assert.equal((normalized.meta.domainTags ?? []).includes("manufacturing"), true);
});

test("cross-domain adapter: custom adapter can be registered in registry", () => {
  const registry = new DomainAdapterRegistry();
  registry.register({
    adapterId: "building.v1",
    priority: 10,
    supports: (spu) => spu.spuId.startsWith("building."),
    classify: () => "compliance",
    resolveDomain: () => "building",
    resolveIndustryTag: () => "std.building",
    resolveTags: () => ["building", "custom-adapter"],
  });
  const profile = registry.getProfile(createSpu({
    spuId: "building.fire.safety@v1",
  }));
  assert.equal(profile.adapterId, "building.v1");
  assert.equal(profile.domain, "building");
  assert.equal(profile.classification, "compliance");
  assert.equal(profile.industryTag, "std.building");
});
