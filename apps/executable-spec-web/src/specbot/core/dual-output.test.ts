import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import JSZip from "jszip";

import { SPULoader } from "../../spu-loader.ts";
import { SpecBotDualOutput, exportLoadedSpuSpec } from "./dual-output.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const yamlPath = resolve(currentDir, "../../subgrade.compaction.spu.yaml");
const yamlContent = readFileSync(yamlPath, "utf-8");

function createLoadedSpu() {
  return new SPULoader().load(yamlContent);
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

test("toJSON keeps full SPU structure and adds SpecBot metadata", () => {
  const spu = createLoadedSpu();
  const output = new SpecBotDualOutput().toJSON(spu);

  assert.equal(output.specId, spu.spuId);
  assert.equal(output.format, "SPU-v1");
  assert.equal(output.generatedBy, "SpecBot-v1.0");
  assert.equal(output.markdownRef, `${spu.spuId}.md`);
  assert.deepEqual(output.output, {
    formats: ["markdown", "json"],
    bundling: true,
  });
  assert.deepEqual(output.meta, spu.meta);
  assert.deepEqual(output.forms, spu.forms);
  assert.deepEqual(output.data, spu.data);
  assert.deepEqual(output.path, spu.path);
  assert.deepEqual(output.rules, spu.rules);
  assert.deepEqual(output.proof, spu.proof);
  assert.match(output.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("toMarkdown renders readable sections for field handoff", () => {
  const spu = createLoadedSpu();
  const exporter = new SpecBotDualOutput();
  const json = exporter.toJSON(spu);
  const markdown = exporter.toMarkdown(spu, json, {
    jsonPayloadSha256: "hash-for-test",
  });

  assert.match(markdown, /^# /);
  assert.match(markdown, /## 一、适用范围/);
  assert.match(markdown, /## 二、检测步骤/);
  assert.match(markdown, /## 三、合格标准/);
  assert.match(markdown, /## 四、输入参数/);
  assert.match(markdown, /## 五、系统对接/);
  assert.match(markdown, /calc_wet_density/);
  assert.match(markdown, /massHoleSand/);
  assert.match(markdown, /jsonPayloadSha256/);
  assert.doesNotMatch(markdown, /RULE-COMPACTION-001/);
  assert.match(markdown, new RegExp(`${spu.spuId}\\.json`));
});

test("generate returns markdown json and a specbundle that can be extracted", async () => {
  const spu = createLoadedSpu();
  const exporter = new SpecBotDualOutput();
  const output = await exporter.generate(spu);
  const zip = await JSZip.loadAsync(output.bundle);

  const aliasMarkdown = await zip.file("spec.md")?.async("string");
  const aliasJson = await zip.file("spec.json")?.async("string");
  const aliasJsonObj = aliasJson ? JSON.parse(aliasJson) as Record<string, unknown> : null;
  const readme = await zip.file("README.txt")?.async("string");

  assert.equal(aliasMarkdown, output.markdown);
  assert.ok(aliasJsonObj);
  assert.equal(String(aliasJsonObj?.specId ?? ""), output.json.specId);
  assert.equal(String(aliasJsonObj?.format ?? ""), output.json.format);
  assert.equal(String(aliasJsonObj?.spec_md_hash ?? "").length > 0, true);
  assert.equal(typeof aliasJsonObj?.hash_manifest, "object");
  assert.match(readme ?? "", /SpecBundle v1\.0/);
  assert.match(readme ?? "", /spec\.md/);
  assert.match(readme ?? "", /spec\.json/);
  assert.match(readme ?? "", /Human-readable handoff/);
  assert.match(readme ?? "", /Machine-executable rule payload/);
  assert.match(readme ?? "", /Auditable integrity binding/);
});

test("generate adds integrity binding hashes for markdown and json payload", async () => {
  const spu = createLoadedSpu();
  const output = await new SpecBotDualOutput().generate(spu);
  const integrity = output.json.integrity;

  assert.equal(integrity.algorithm, "sha256");
  assert.equal(integrity.hashScope, "json-without-integrity");
  assert.equal(integrity.markdownRef, `${spu.spuId}.md`);
  assert.equal(integrity.jsonRef, `${spu.spuId}.json`);
  assert.equal(integrity.markdownSha256, sha256(output.markdown));
  assert.equal(integrity.bindingSha256, sha256(`${integrity.markdownSha256}:${integrity.jsonPayloadSha256}`));
  assert.ok(output.markdown.includes(integrity.jsonPayloadSha256));
});

test("exportLoadedSpuSpec exports directly from the loaded SPU cache", async () => {
  const spu = createLoadedSpu();
  const output = await exportLoadedSpuSpec(spu.spuId);

  assert.equal(output.json.specId, spu.spuId);
  assert.equal(output.json.markdownRef, `${spu.spuId}.md`);
  assert.equal(output.json.output.bundling, true);
});
