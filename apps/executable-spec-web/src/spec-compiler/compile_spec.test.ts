import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { compileSpec } from "./compile_spec.ts";
import { getBuiltInTemplates } from "./templates/builtins.ts";
import { renderMarkdownFromTemplate } from "./templates/renderer.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const examplesDir = resolve(currentDir, "examples");

function readExample(filename: string): string {
  return readFileSync(resolve(examplesDir, filename), "utf-8");
}

test("compileSpec: valid markdown should output unified artifacts", async () => {
  const markdown = readExample("valid-spec.md");
  const result = await compileSpec(markdown, { source: "markdown" });

  assert.equal(result.success, true);
  assert.equal(result.lintResult.valid, true);
  assert.equal(result.compileResult.stage, "completed");
  assert.equal(result.spu.spuId, "highway.subgrade.compaction.4.2.1.soil@v1");
  assert.equal(result.spuSchema.spuId, "highway.subgrade.compaction.4.2.1.soil@v1");
  assert.equal(result.specbundle.fileName, "highway.subgrade.compaction.4.2.1.soil@v1.specbundle");
  assert.ok(result.specbundle.byteLength > 0);
  assert.ok(result.specbundle.base64.length > 0);
});

test("compileSpec: invalid markdown should fail at lint stage", async () => {
  const markdown = readExample("invalid-spec.md");
  const result = await compileSpec(markdown, { source: "markdown" });

  assert.equal(result.success, false);
  assert.equal(result.compileResult.stage, "lint");
  assert.equal(result.lintResult.valid, false);
  assert.equal(result.spu, null);
  assert.equal(result.spuSchema, null);
  assert.equal(result.specbundle, null);
});

test("compileSpec: template markdown and direct markdown use the same output contract", async () => {
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

  const result = await compileSpec(markdown, { source: "template" });
  assert.equal(result.success, true);
  assert.equal(result.compileResult.stage, "completed");
  assert.equal(result.spu.meta.clause, "4.2.188");
  assert.equal(result.spuSchema.meta.clause, "4.2.188");
  assert.equal(result.specbundle.fileName.endsWith(".specbundle"), true);
});
