import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { SPULoader } from "../../spu-loader.ts";
import { CORE_ASSET_SPECS } from "./core-asset-manifest.ts";
import { SpecBotDualOutput } from "./dual-output.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const generatedDir = resolve(currentDir, "../generated");
const loader = new SPULoader();

const TARGET_SPECS = CORE_ASSET_SPECS.map((item) => ({
  yamlPath: resolve(currentDir, "../../", item.yamlFileName),
  mdPath: resolve(generatedDir, item.generatedMarkdownFile),
  jsonPath: resolve(generatedDir, item.generatedJsonFile),
  passInputs: item.passInputs,
  expectedStatus: item.expectedStatus,
}));

test("target SPU YAML assets load and execute successfully", () => {
  for (const target of TARGET_SPECS) {
    const yamlText = readFileSync(target.yamlPath, "utf-8");
    const spu = loader.load(yamlText);
    const result = loader.execute(spu.spuId, target.passInputs);

    assert.equal(result.status, target.expectedStatus);
    assert.equal(result.proof.result.status, target.expectedStatus);
  }
});

test("generated Markdown and JSON assets exist for the three finalized SPUs", () => {
  for (const target of TARGET_SPECS) {
    assert.equal(existsSync(target.mdPath), true, `missing markdown asset: ${target.mdPath}`);
    assert.equal(existsSync(target.jsonPath), true, `missing json asset: ${target.jsonPath}`);
  }
});

test("generated JSON assets keep runtime fields and generated markdown references", () => {
  for (const target of TARGET_SPECS) {
    const yamlText = readFileSync(target.yamlPath, "utf-8");
    const spu = loader.load(yamlText);
    const generatedJson = JSON.parse(readFileSync(target.jsonPath, "utf-8")) as Record<string, unknown>;
    const markdown = readFileSync(target.mdPath, "utf-8");

    assert.equal(generatedJson.specId, spu.spuId);
    assert.equal(generatedJson.format, "SPU-v1");
    assert.equal(generatedJson.generatedBy, "SpecBot-v1.0");
    assert.deepEqual(generatedJson.meta, spu.meta);
    assert.deepEqual(generatedJson.forms, spu.forms);
    assert.deepEqual(generatedJson.data, spu.data);
    assert.deepEqual(generatedJson.path, spu.path);
    assert.deepEqual(generatedJson.rules, spu.rules);
    assert.deepEqual(generatedJson.proof, spu.proof);
    assert.match(markdown, new RegExp(`${spu.spuId}\\.json`));
  }
});

test("generated markdown stays aligned with the exporter structure", async () => {
  const exporter = new SpecBotDualOutput();

  for (const target of TARGET_SPECS) {
    const yamlText = readFileSync(target.yamlPath, "utf-8");
    const spu = loader.load(yamlText);
    const markdown = readFileSync(target.mdPath, "utf-8");
    const regenerated = await exporter.generate(spu);

    assert.match(markdown, /^# /);
    assert.equal(markdown, regenerated.markdown);
  }
});
