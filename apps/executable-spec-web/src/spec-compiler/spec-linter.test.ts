import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { lintMarkdownSpec } from "./markdown_linter.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const examplesDir = resolve(currentDir, "examples");

function readExample(filename: string): string {
  return readFileSync(resolve(examplesDir, filename), "utf-8");
}

test("Spec Linter v1: valid markdown returns no errors/warnings", () => {
  const result = lintMarkdownSpec(readExample("valid-spec.md"));

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test("Spec Linter v1: invalid markdown returns required errors", () => {
  const result = lintMarkdownSpec(readExample("invalid-spec.md"));
  const codes = result.errors.map((item) => item.code);

  assert.equal(result.valid, false);
  assert.ok(codes.includes("MISSING_SECTION"));
  assert.ok(codes.includes("INVALID_INPUT_FORMAT"));
  assert.ok(codes.includes("INVALID_DEPENDS"));
  assert.ok(codes.includes("INVALID_CALCULATION"));
  assert.ok(codes.includes("DUPLICATE_FIELD"));
});

test("Spec Linter v1: missing depends section is warning only", () => {
  const markdown = `
# 测试规范
规范来源：JTG
条款号：1.0
版本：v1
分类：subgrade
检测项：compaction

## 输入参数
- a | number | mm | 参数A

## 输出参数
- b

## 计算步骤
1. b = a + 1

## 判定规则
- b >= 1 | b 必须 >= 1

## 签字要求
- lab
`.trim();

  const result = lintMarkdownSpec(markdown);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0]?.code, "MISSING_DEPENDS");
});
