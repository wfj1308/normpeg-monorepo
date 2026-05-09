import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import JSZip from "jszip";

import { SPULoader } from "../spu-loader.ts";
import { SpecBotDualOutput } from "../specbot/core/dual-output.ts";
import { loadRuntimeSpuRegistry } from "../spu-registry.ts";
import { loadSpecBundle, registerBundleSpec, SpecBundleError } from "./specbundle-loader.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const yamlPath = resolve(currentDir, "../subgrade.compaction.spu.yaml");
const yamlContent = readFileSync(yamlPath, "utf-8");

function createUniqueSpu(idSuffix: string) {
  const spu = new SPULoader().load(yamlContent);
  return {
    ...JSON.parse(JSON.stringify(spu)),
    spuId: `bundle.test.${idSuffix}@v1`,
  };
}

async function createBundleBlob(idSuffix: string): Promise<Blob> {
  const output = await new SpecBotDualOutput().generate(createUniqueSpu(idSuffix));
  return new Blob([output.bundle], { type: "application/octet-stream" });
}

test("loadSpecBundle extracts spec.md spec.json and readme", async () => {
  const bundleBlob = await createBundleBlob("load");
  const loaded = await loadSpecBundle(bundleBlob);

  assert.match(loaded.markdown, /^# /);
  assert.equal(loaded.json.specId, "bundle.test.load@v1");
  assert.match(loaded.readme, /SpecBundle v1\.0/);
});

test("loadSpecBundle rejects bundle missing required files", async () => {
  const zip = new JSZip();
  zip.file("spec.json", JSON.stringify({ specId: "broken" }));
  const bundle = await zip.generateAsync({ type: "uint8array" });

  await assert.rejects(
    () => loadSpecBundle(new Blob([bundle], { type: "application/octet-stream" })),
    (error: unknown) => error instanceof SpecBundleError && error.code === "INVALID_SPEC_BUNDLE",
  );
});

test("registerBundleSpec registers a specbundle SPU into the runtime registry", async () => {
  const loaded = await loadSpecBundle(await createBundleBlob("register"));
  const entry = registerBundleSpec(loaded);
  const registry = await loadRuntimeSpuRegistry();

  assert.equal(entry.spu.spuId, "bundle.test.register@v1");
  assert.equal(entry.registryItem.sourceType, "specbundle");
  assert.ok(registry.some((item) => item.spu.spuId === "bundle.test.register@v1" && item.registryItem.sourceType === "specbundle"));
});

test("registerBundleSpec rejects duplicate spec ids", async () => {
  const loaded = await loadSpecBundle(await createBundleBlob("duplicate"));
  registerBundleSpec(loaded);

  assert.throws(
    () => registerBundleSpec(loaded),
    (error: unknown) => error instanceof SpecBundleError && error.code === "DUPLICATE_SPEC_ID",
  );
});

