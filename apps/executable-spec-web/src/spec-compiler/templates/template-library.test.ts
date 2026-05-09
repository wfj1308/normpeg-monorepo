import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";

import { PlatformService } from "../../platform/workflow/platform-service.ts";
import { getBuiltInTemplates } from "./builtins.ts";
import { createAndRegisterSpecFromTemplate } from "./create_from_template.ts";
import { renderMarkdownFromTemplate } from "./renderer.ts";

async function readSpecbundleJson(base64: string): Promise<Record<string, unknown>> {
  const zip = await JSZip.loadAsync(Buffer.from(base64, "base64"));
  const specJsonText = await zip.file("spec.json")?.async("string");
  if (!specJsonText) {
    throw new Error("spec.json not found in specbundle");
  }
  return JSON.parse(specJsonText) as Record<string, unknown>;
}

test("Template library v1: built-in templates should include 3 required templates", () => {
  const templates = getBuiltInTemplates();
  const ids = templates.map((item) => item.templateId);

  assert.ok(ids.includes("subgrade-compaction-soil"));
  assert.ok(ids.includes("subgrade-thickness"));
  assert.ok(ids.includes("subgrade-deflection"));
  assert.equal(templates.length >= 3, true);
});

test("Template library v1: render should fail if required variable is missing", () => {
  const template = getBuiltInTemplates().find((item) => item.templateId === "subgrade-compaction-soil");
  assert.ok(template);
  assert.throws(
    () =>
      renderMarkdownFromTemplate(template!, {
        norm: "JTG F80/1-2017",
        clause: "4.2.1",
        version: "v1",
        category: "subgrade",
        measuredItem: "compaction",
        threshold: "",
      }),
    /模板变量缺失/,
  );
});

test("Template library v1: create and register from compaction template", async () => {
  const service = new PlatformService();
  const result = await createAndRegisterSpecFromTemplate(service, "subgrade-compaction-soil", {
    norm: "JTG F80/1-2017",
    clause: "4.2.188",
    version: "v1",
    category: "subgrade",
    measuredItem: "compaction",
    threshold: 93,
  });

  assert.equal(result.registerResult.success, true);
  assert.ok(result.compileArtifact);
  assert.equal(result.lintResult.valid, true);
  assert.equal(result.compileResult.stage, "completed");
  assert.ok(result.spu);
  assert.ok(result.specbundle);
  assert.equal(result.relation.templateId, "subgrade-compaction-soil");
  assert.equal(result.relation.baseType, "subgrade.compaction");
  if (result.registerResult.success) {
    assert.equal(result.registerResult.stage, "registered");
    assert.equal(result.registerResult.lint.valid, true);
    assert.equal(result.registerResult.compileArtifact.success, true);
    assert.equal(result.compileArtifact?.success, true);
    assert.equal(result.spu?.spuId, result.registerResult.spuId);
    assert.equal(result.lintResult, result.registerResult.compileArtifact.lintResult);
    assert.equal(result.compileResult, result.registerResult.compileArtifact.compileResult);
    assert.equal(result.specbundle, result.registerResult.compileArtifact.specbundle);
    const registered = service.getRegistry().find((item) => item.spuId === result.registerResult.spuId);
    assert.ok(registered);
    const extension = (registered?.proof.extensions ?? {}) as Record<string, unknown>;
    const lineage = extension.templateInheritance as Record<string, unknown> | undefined;
    assert.ok(lineage);
    assert.equal(lineage?.templateId, "subgrade-compaction-soil");
    assert.equal(lineage?.derivedSpuId, result.registerResult.spuId);
    assert.ok(result.specbundle);
    const specJson = await readSpecbundleJson(result.specbundle!.base64);
    const proof = (specJson.proof ?? {}) as Record<string, unknown>;
    const proofExtensions = (proof.extensions ?? {}) as Record<string, unknown>;
    const bundleLineage = proofExtensions.templateInheritance as Record<string, unknown> | undefined;
    assert.ok(bundleLineage);
    assert.equal(bundleLineage?.templateId, "subgrade-compaction-soil");
  }
});

test("Template library v1: derivation overrides should apply clause/threshold/description", async () => {
  const service = new PlatformService();
  const result = await createAndRegisterSpecFromTemplate(
    service,
    "subgrade-compaction-soil",
    {
      norm: "JTG F80/1-2017",
      clause: "4.2.100",
      version: "v1",
      category: "subgrade",
      measuredItem: "compaction",
      threshold: 90,
    },
    {
      overrides: {
        clause: "4.2.101",
        threshold: 95,
        description: "site specific note",
      },
    },
  );

  assert.equal(result.values.clause, "4.2.101");
  assert.equal(result.values.threshold, 95);
  assert.equal(result.values.description, "site specific note");
  assert.ok(result.markdown.includes("{{description}}") === false);
  assert.ok(result.markdown.includes("site specific note"));
  assert.equal(result.relation.overrides.clause, "4.2.101");
  assert.equal(result.relation.overrides.threshold, 95);
  assert.equal(result.relation.overrides.description, "site specific note");
});

test("Template library v1: duplicate registration should return SPU_ALREADY_EXISTS", async () => {
  const service = new PlatformService();
  const values = {
    norm: "JTG F80/1-2017",
    clause: "4.2.199",
    version: "v1",
    category: "subgrade",
    measuredItem: "compaction",
    threshold: 93,
  };
  const first = await createAndRegisterSpecFromTemplate(service, "subgrade-compaction-soil", values);
  assert.equal(first.registerResult.success, true);

  const second = await createAndRegisterSpecFromTemplate(service, "subgrade-compaction-soil", values);
  assert.equal(second.registerResult.success, false);
  if (!second.registerResult.success) {
    assert.equal(second.registerResult.stage, "register");
    assert.equal(second.registerResult.error, "SPU_ALREADY_EXISTS");
  }
});
