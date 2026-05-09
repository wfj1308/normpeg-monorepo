import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import JSZip from "jszip";

const currentDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(currentDir, "..");
const templatesRoot = resolve(rootDir, "templates", "subgrade-templates-v1");
const outputDir = resolve(templatesRoot, "dist");

const bundleNameByDir: Record<string, string> = {
  "subgrade-compaction": "highway.subgrade.compaction.4.2.1.soil@v1.specbundle",
  "subgrade-thickness": "highway.subgrade.thickness@v1.specbundle",
  "subgrade-deflection": "highway.subgrade.deflection@v1.specbundle",
};

async function buildOne(templateDir: string): Promise<void> {
  const dirName = templateDir.split(/[\\/]/).pop() ?? "";
  const bundleName = bundleNameByDir[dirName];
  if (!bundleName) {
    return;
  }

  const specMd = await readFile(join(templateDir, "spec.md"), "utf8");
  const specJson = await readFile(join(templateDir, "spec.json"), "utf8");
  const readme = await readFile(join(templateDir, "README.txt"), "utf8");

  const zip = new JSZip();
  zip.file("spec.md", specMd);
  zip.file("spec.json", specJson);
  zip.file("README.txt", readme);

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
  await writeFile(join(outputDir, bundleName), buffer);
  // eslint-disable-next-line no-console
  console.log(`generated: ${bundleName}`);
}

async function main(): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const entries = await readdir(templatesRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "dist") {
      continue;
    }
    await buildOne(join(templatesRoot, entry.name));
  }
}

void main();
