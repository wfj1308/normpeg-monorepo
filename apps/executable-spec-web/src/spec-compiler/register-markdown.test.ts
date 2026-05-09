import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PlatformService } from "../platform/workflow/platform-service.ts";
import { registerMarkdownSpec } from "./register_markdown.ts";
import { getBuiltInTemplates } from "./templates/builtins.ts";
import { renderMarkdownFromTemplate } from "./templates/renderer.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const examplesDir = resolve(currentDir, "examples");

function readExample(filename: string): string {
  return readFileSync(resolve(examplesDir, filename), "utf-8");
}

test("Markdown register flow: valid markdown can lint, compile and register", async () => {
  const service = new PlatformService();
  const markdown = readExample("valid-spec.md");

  const result = await registerMarkdownSpec(service, markdown);
  assert.equal(result.success, true);
  assert.equal(result.stage, "registered");
  assert.equal(result.lint.valid, true);
  assert.equal(result.spuId, "highway.subgrade.compaction.4.2.1.soil@v1");
  assert.equal(result.compileArtifact.success, true);
  assert.equal(result.lintResult.valid, true);
  assert.equal(result.compileResult.stage, "completed");
  assert.equal(result.spu?.spuId, result.spuId);
  assert.ok(result.specbundle);
  assert.equal(result.compileArtifact.spu.spuId, result.spuId);
  assert.equal(result.compileArtifact.spuSchema.spuId, result.spuId);
  assert.equal(result.lintResult, result.compileArtifact.lintResult);
  assert.equal(result.compileResult, result.compileArtifact.compileResult);
  assert.equal(result.spu, result.compileArtifact.spu);
  assert.equal(result.specbundle, result.compileArtifact.specbundle);
});

test("Markdown register flow: invalid markdown should stop at lint stage", async () => {
  const service = new PlatformService();
  const markdown = readExample("invalid-spec.md");

  const result = await registerMarkdownSpec(service, markdown);
  assert.equal(result.success, false);
  assert.equal(result.stage, "lint");
  assert.equal(result.lint.valid, false);
  assert.ok(result.lint.errors.length > 0);
  assert.equal(result.compileArtifact.success, false);
  assert.equal(result.compileArtifact.compileResult.stage, "lint");
  assert.equal(result.lintResult.valid, false);
  assert.equal(result.compileResult.stage, "lint");
  assert.equal(result.spu, null);
  assert.equal(result.specbundle, null);
});

test("Markdown register flow: duplicate spuId should return conflict", async () => {
  const service = new PlatformService();
  const markdown = readExample("valid-spec.md");

  const first = await registerMarkdownSpec(service, markdown);
  assert.equal(first.success, true);

  const second = await registerMarkdownSpec(service, markdown);
  assert.equal(second.success, false);
  assert.equal(second.stage, "register");
  assert.equal(second.error, "SPU_ALREADY_EXISTS");
  assert.equal(second.spuId, "highway.subgrade.compaction.4.2.1.soil@v1");
  assert.equal(second.compileArtifact.success, true);
  assert.equal(second.compileResult.stage, "completed");
  assert.equal(second.spu?.spuId, "highway.subgrade.compaction.4.2.1.soil@v1");
  assert.ok(second.specbundle);
});

test("Template/PDF/Markdown entries: final artifacts share the same standard shape", async () => {
  const template = getBuiltInTemplates().find((item) => item.templateId === "subgrade-compaction-soil");
  assert.ok(template);

  const markdown = renderMarkdownFromTemplate(template!, {
    norm: "JTG F80/1-2017",
    clause: "4.2.188",
    version: "v1",
    category: "subgrade",
    measuredItem: "compaction",
    threshold: 93,
  });

  const templateResult = await registerMarkdownSpec(new PlatformService(), markdown, "template");
  const pdfResult = await registerMarkdownSpec(new PlatformService(), markdown, "pdf");
  const markdownResult = await registerMarkdownSpec(new PlatformService(), markdown, "markdown");

  assert.equal(templateResult.success, true);
  assert.equal(pdfResult.success, true);
  assert.equal(markdownResult.success, true);

  if (templateResult.success && pdfResult.success && markdownResult.success) {
    assert.deepEqual(templateResult.spu, pdfResult.spu);
    assert.deepEqual(templateResult.spu, markdownResult.spu);
    assert.equal(templateResult.specbundle?.fileName, pdfResult.specbundle?.fileName);
    assert.equal(templateResult.specbundle?.fileName, markdownResult.specbundle?.fileName);
    assert.equal(templateResult.compileResult.stage, "completed");
    assert.equal(pdfResult.compileResult.stage, "completed");
    assert.equal(markdownResult.compileResult.stage, "completed");
    assert.equal(templateResult.lintResult.valid, true);
    assert.equal(pdfResult.lintResult.valid, true);
    assert.equal(markdownResult.lintResult.valid, true);
  }
});
