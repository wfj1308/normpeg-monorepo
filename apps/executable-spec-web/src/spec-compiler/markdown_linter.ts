import {
  META_KEY_MAP,
  META_LABELS,
  REQUIRED_META_KEYS,
  REQUIRED_SECTIONS,
  SECTION_TITLE_MAP,
  SUPPORTED_INPUT_TYPES,
  SUPPORTED_RULE_OPERATORS,
} from "./lint_rules.ts";

import type {
  LintSectionLine,
  LintSectionKey,
  ParsedLintBlocks,
  SpecLintErrorCode,
  SpecLintResult,
  SpecLintWarningCode,
} from "./lint_types.ts";

function normalizeLineBreaks(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function normalizeHeading(text: string): string {
  return text.replace(/\s+/g, "");
}

function pushError(
  errors: SpecLintResult["errors"],
  code: SpecLintErrorCode,
  section: string,
  message: string,
  line?: number,
): void {
  errors.push({ code, section, message, line });
}

function pushWarning(
  warnings: SpecLintResult["warnings"],
  code: SpecLintWarningCode,
  section: string,
  message: string,
  line?: number,
): void {
  warnings.push({ code, section, message, line });
}

function stripBulletPrefix(line: string): string | null {
  const match = /^\s*-\s+(.+?)\s*$/.exec(line);
  if (!match) {
    return null;
  }
  return match[1]?.trim() ?? "";
}

function stripNumberPrefix(line: string): string | null {
  const match = /^\s*\d+\.\s+(.+?)\s*$/.exec(line);
  if (!match) {
    return null;
  }
  return match[1]?.trim() ?? "";
}

function splitOnce(input: string, separator: string): [string, string] | null {
  const idx = input.indexOf(separator);
  if (idx < 0) {
    return null;
  }
  return [input.slice(0, idx), input.slice(idx + separator.length)];
}

function isDuplicate(items: string[], value: string): boolean {
  return items.includes(value);
}

function extractBlocks(markdown: string): ParsedLintBlocks {
  const content = normalizeLineBreaks(markdown ?? "");
  const lines = content.split("\n");

  const sectionLines: Record<LintSectionKey, LintSectionLine[]> = {
    inputs: [],
    outputs: [],
    calculations: [],
    rules: [],
    signatures: [],
    dependsOn: [],
  };
  const sectionPresence: Record<LintSectionKey, boolean> = {
    inputs: false,
    outputs: false,
    calculations: false,
    rules: false,
    signatures: false,
    dependsOn: false,
  };
  const metaLines: LintSectionLine[] = [];

  let title = "";
  let titleLine: number | null = null;
  let cursor = 0;
  while (cursor < lines.length) {
    const trimmed = (lines[cursor] ?? "").trim();
    if (!trimmed) {
      cursor += 1;
      continue;
    }
    const titleMatch = /^#\s+(.+)$/.exec(trimmed);
    if (titleMatch?.[1]?.trim()) {
      title = titleMatch[1].trim();
      titleLine = cursor + 1;
    }
    cursor += 1;
    break;
  }

  let currentSection: LintSectionKey | null = null;
  for (; cursor < lines.length; cursor += 1) {
    const raw = lines[cursor] ?? "";
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }

    const sectionMatch = /^##\s+(.+)$/.exec(trimmed);
    if (sectionMatch?.[1]) {
      const heading = normalizeHeading(sectionMatch[1]);
      const mapped = SECTION_TITLE_MAP[heading];
      currentSection = mapped ?? null;
      if (mapped) {
        sectionPresence[mapped] = true;
      }
      continue;
    }

    const item: LintSectionLine = { content: trimmed, line: cursor + 1 };
    if (currentSection) {
      sectionLines[currentSection].push(item);
    } else {
      metaLines.push(item);
    }
  }

  return {
    title,
    titleLine,
    metaLines,
    sectionLines,
    sectionPresence,
  };
}

export function validateTitle(blocks: ParsedLintBlocks, result: SpecLintResult): void {
  if (blocks.title.trim()) {
    return;
  }
  pushError(result.errors, "MISSING_TITLE", "标题", "缺少一级标题（# 标题）", blocks.titleLine ?? undefined);
}

export function validateMeta(blocks: ParsedLintBlocks, result: SpecLintResult): void {
  const metaValues: Partial<Record<(typeof REQUIRED_META_KEYS)[number], string>> = {};

  for (const item of blocks.metaLines) {
    const matched = /^([^:：]+)\s*[:：]\s*(.+)$/.exec(item.content);
    if (!matched?.[1] || !matched[2]) {
      continue;
    }
    const key = matched[1].trim();
    const value = matched[2].trim();
    const mapped = META_KEY_MAP[key];
    if (!mapped) {
      continue;
    }
    metaValues[mapped] = value;
  }

  for (const key of REQUIRED_META_KEYS) {
    if (metaValues[key]?.trim()) {
      continue;
    }
    pushError(
      result.errors,
      "MISSING_META",
      META_LABELS[key],
      `缺少元信息字段“${META_LABELS[key]}”`,
    );
  }
}

function validateRequiredSections(blocks: ParsedLintBlocks, result: SpecLintResult): void {
  for (const section of REQUIRED_SECTIONS) {
    const present = blocks.sectionPresence[section.key];
    if (present) {
      continue;
    }
    if (section.key === "dependsOn") {
      pushWarning(
        result.warnings,
        "MISSING_DEPENDS",
        section.sectionName,
        "未声明依赖，默认按 none 处理",
      );
      continue;
    }
    pushError(result.errors, "MISSING_SECTION", section.sectionName, `缺少“${section.sectionName}”章节`);
  }
}

export function validateInputs(blocks: ParsedLintBlocks, result: SpecLintResult): void {
  if (!blocks.sectionPresence.inputs) {
    return;
  }

  const names: string[] = [];
  let parsedCount = 0;
  for (const item of blocks.sectionLines.inputs) {
    const bullet = stripBulletPrefix(item.content);
    if (!bullet) {
      pushError(
        result.errors,
        "INVALID_INPUT_FORMAT",
        "输入参数",
        "输入参数行格式必须是 `- name | type | unit | label`",
        item.line,
      );
      continue;
    }

    const parts = bullet.split("|").map((part) => part.trim());
    if (parts.length !== 4) {
      pushError(
        result.errors,
        "INVALID_INPUT_FORMAT",
        "输入参数",
        "输入参数必须包含 4 段：name | type | unit | label",
        item.line,
      );
      continue;
    }

    const [name, typeRaw, , label] = parts;
    const type = typeRaw.toLowerCase();
    if (!name || !label) {
      pushError(result.errors, "INVALID_INPUT_FORMAT", "输入参数", "name 和 label 不能为空", item.line);
      continue;
    }
    if (!SUPPORTED_INPUT_TYPES.has(type)) {
      pushError(
        result.errors,
        "INVALID_INPUT_FORMAT",
        "输入参数",
        `type 仅支持 number|string|boolean，当前为 ${typeRaw}`,
        item.line,
      );
      continue;
    }
    if (isDuplicate(names, name)) {
      pushError(result.errors, "DUPLICATE_FIELD", "输入参数", `输入参数重复：${name}`, item.line);
      continue;
    }
    names.push(name);
    parsedCount += 1;
  }

  if (parsedCount === 0) {
    pushError(result.errors, "INVALID_INPUT_FORMAT", "输入参数", "输入参数至少需要 1 条");
  }
}

export function validateOutputs(blocks: ParsedLintBlocks, result: SpecLintResult): string[] {
  const outputs: string[] = [];
  if (!blocks.sectionPresence.outputs) {
    return outputs;
  }

  for (const item of blocks.sectionLines.outputs) {
    const output = stripBulletPrefix(item.content);
    if (!output) {
      pushError(result.errors, "INVALID_OUTPUT", "输出参数", "输出参数行格式必须是 `- outputName`", item.line);
      continue;
    }
    if (!output.trim()) {
      pushError(result.errors, "INVALID_OUTPUT", "输出参数", "输出参数不能为空", item.line);
      continue;
    }
    if (isDuplicate(outputs, output)) {
      pushError(result.errors, "DUPLICATE_FIELD", "输出参数", `输出参数重复：${output}`, item.line);
      continue;
    }
    outputs.push(output);
  }

  if (outputs.length === 0) {
    pushError(result.errors, "INVALID_OUTPUT", "输出参数", "输出参数至少需要 1 条");
  }
  return outputs;
}

export function validateCalculations(
  blocks: ParsedLintBlocks,
  outputs: string[],
  result: SpecLintResult,
): void {
  if (!blocks.sectionPresence.calculations) {
    return;
  }

  let parsedCount = 0;
  const producedVars: string[] = [];

  for (const item of blocks.sectionLines.calculations) {
    const formula = stripNumberPrefix(item.content);
    if (!formula) {
      pushError(
        result.errors,
        "INVALID_CALCULATION",
        "计算步骤",
        "计算步骤行格式必须是 `1. variable = expression`",
        item.line,
      );
      continue;
    }

    const split = splitOnce(formula, "=");
    if (!split) {
      pushError(result.errors, "INVALID_CALCULATION", "计算步骤", "计算步骤必须包含 `=`", item.line);
      continue;
    }
    const [lhs, rhs] = split.map((part) => part.trim());
    if (!lhs || !rhs) {
      pushError(
        result.errors,
        "INVALID_CALCULATION",
        "计算步骤",
        "计算步骤左侧变量名和右侧表达式都不能为空",
        item.line,
      );
      continue;
    }
    producedVars.push(lhs);
    parsedCount += 1;
  }

  if (parsedCount === 0) {
    pushError(result.errors, "INVALID_CALCULATION", "计算步骤", "计算步骤至少需要 1 条");
    return;
  }

  for (const variable of producedVars) {
    if (outputs.includes(variable)) {
      continue;
    }
    pushWarning(
      result.warnings,
      "CALC_OUTPUT_NOT_DECLARED",
      "计算步骤",
      `计算结果变量“${variable}”未在“输出参数”中声明（建议保持一致）`,
    );
  }
}

export function validateRules(blocks: ParsedLintBlocks, result: SpecLintResult): void {
  if (!blocks.sectionPresence.rules) {
    return;
  }

  let parsedCount = 0;
  for (const item of blocks.sectionLines.rules) {
    const bullet = stripBulletPrefix(item.content);
    if (!bullet) {
      pushError(
        result.errors,
        "INVALID_RULE",
        "判定规则",
        "判定规则行格式必须是 `- field operator value | message`",
        item.line,
      );
      continue;
    }

    const pair = splitOnce(bullet, "|");
    if (!pair) {
      pushError(result.errors, "INVALID_RULE", "判定规则", "判定规则必须包含 `|` 分隔 message", item.line);
      continue;
    }
    const [conditionRaw, messageRaw] = pair;
    const condition = conditionRaw.trim();
    const message = messageRaw.trim();
    if (!message) {
      pushError(result.errors, "INVALID_RULE", "判定规则", "判定规则 message 不能为空", item.line);
      continue;
    }

    const validMatched = /^([A-Za-z_][A-Za-z0-9_.]*)\s*(>=|<=|==|!=|>|<)\s*(.+)$/.exec(condition);
    if (!validMatched) {
      const tokenMatch = /^([A-Za-z_][A-Za-z0-9_.]*)\s*([^\s]+)\s*(.+)$/.exec(condition);
      if (tokenMatch?.[2] && !SUPPORTED_RULE_OPERATORS.has(tokenMatch[2])) {
        pushError(
          result.errors,
          "INVALID_OPERATOR",
          "判定规则",
          `不支持的操作符：${tokenMatch[2]}`,
          item.line,
        );
      } else {
        pushError(
          result.errors,
          "INVALID_RULE",
          "判定规则",
          "判定规则条件必须是 `field operator value`",
          item.line,
        );
      }
      continue;
    }

    const field = validMatched[1]?.trim() ?? "";
    const operator = validMatched[2]?.trim() ?? "";
    const value = validMatched[3]?.trim() ?? "";
    if (!field || !value) {
      pushError(result.errors, "INVALID_RULE", "判定规则", "field 和 value 不能为空", item.line);
      continue;
    }
    if (!SUPPORTED_RULE_OPERATORS.has(operator)) {
      pushError(result.errors, "INVALID_OPERATOR", "判定规则", `不支持的操作符：${operator}`, item.line);
      continue;
    }
    parsedCount += 1;
  }

  if (parsedCount === 0) {
    pushError(result.errors, "INVALID_RULE", "判定规则", "判定规则至少需要 1 条");
  }
}

export function validateSignatures(blocks: ParsedLintBlocks, result: SpecLintResult): void {
  if (!blocks.sectionPresence.signatures) {
    return;
  }

  const signatures: string[] = [];
  for (const item of blocks.sectionLines.signatures) {
    const value = stripBulletPrefix(item.content);
    if (!value) {
      pushError(result.errors, "INVALID_SIGNATURE", "签字要求", "签字要求行格式必须是 `- role`", item.line);
      continue;
    }
    if (!value.trim()) {
      pushError(result.errors, "INVALID_SIGNATURE", "签字要求", "签字角色不能为空", item.line);
      continue;
    }
    if (isDuplicate(signatures, value)) {
      pushError(result.errors, "DUPLICATE_FIELD", "签字要求", `签字角色重复：${value}`, item.line);
      continue;
    }
    signatures.push(value);
  }

  if (signatures.length === 0) {
    pushError(result.errors, "INVALID_SIGNATURE", "签字要求", "签字要求至少需要 1 条");
  }
}

export function validateDependsOn(blocks: ParsedLintBlocks, result: SpecLintResult): void {
  if (!blocks.sectionPresence.dependsOn) {
    return;
  }

  const values: string[] = [];
  for (const item of blocks.sectionLines.dependsOn) {
    const value = stripBulletPrefix(item.content);
    if (!value) {
      pushError(result.errors, "INVALID_DEPENDS", "依赖", "依赖行格式必须是 `- none` 或 `- spuId`", item.line);
      continue;
    }
    if (isDuplicate(values, value)) {
      pushError(result.errors, "DUPLICATE_FIELD", "依赖", `依赖项重复：${value}`, item.line);
      continue;
    }
    values.push(value);
  }

  if (values.length === 0) {
    pushError(result.errors, "INVALID_DEPENDS", "依赖", "依赖至少需要 1 条，或移除整个章节使用默认 none");
    return;
  }

  const lowered = values.map((item) => item.toLowerCase());
  const hasNone = lowered.includes("none");
  if (hasNone) {
    if (values.length > 1) {
      pushError(result.errors, "INVALID_DEPENDS", "依赖", "依赖为 none 时不能和其他 spuId 混用");
    }
    return;
  }

  for (let i = 0; i < values.length; i += 1) {
    const value = values[i] ?? "";
    if (!/.+@.+/.test(value)) {
      pushError(result.errors, "INVALID_DEPENDS", "依赖", `依赖项不是合法 spuId：${value}`, blocks.sectionLines.dependsOn[i]?.line);
    }
  }
}

export function lintMarkdownSpec(markdown: string): SpecLintResult {
  const blocks = extractBlocks(markdown);
  const result: SpecLintResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  validateTitle(blocks, result);
  validateMeta(blocks, result);
  validateRequiredSections(blocks, result);
  validateInputs(blocks, result);
  const outputs = validateOutputs(blocks, result);
  validateCalculations(blocks, outputs, result);
  validateRules(blocks, result);
  validateSignatures(blocks, result);
  validateDependsOn(blocks, result);

  result.valid = result.errors.length === 0;
  return result;
}
