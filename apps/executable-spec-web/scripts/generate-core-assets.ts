import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SPULoader } from "../src/spu-loader.ts";
import { CORE_ASSET_SPECS } from "../src/specbot/core/core-asset-manifest.ts";
import { SpecBotDualOutput } from "../src/specbot/core/dual-output.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(currentDir, "..");
const generatedDir = resolve(rootDir, "src/specbot/generated");

async function main() {
  mkdirSync(generatedDir, { recursive: true });

  const loader = new SPULoader();
  const exporter = new SpecBotDualOutput();

  for (const target of CORE_ASSET_SPECS) {
    const fileName = target.yamlFileName;
    const yamlPath = resolve(rootDir, "src", fileName);
    const yamlText = readFileSync(yamlPath, "utf-8");
    const spu = loader.load(yamlText);
    const output = await exporter.generate(spu);

    writeFileSync(resolve(generatedDir, `${spu.spuId}.md`), output.markdown, "utf-8");
    writeFileSync(resolve(generatedDir, `${spu.spuId}.json`), `${JSON.stringify(output.json, null, 2)}\n`, "utf-8");
  }
}

void main();
