import type { LintSectionKey } from "./lint_types.ts";

export const SECTION_TITLE_MAP: Record<string, LintSectionKey> = {
  输入参数: "inputs",
  输出参数: "outputs",
  计算步骤: "calculations",
  判定规则: "rules",
  签字要求: "signatures",
  依赖: "dependsOn",
};

export const META_LABELS = {
  norm: "规范来源",
  clause: "条款号",
  version: "版本",
  category: "分类",
  measuredItem: "检测项",
} as const;

export const REQUIRED_META_KEYS = [
  "norm",
  "clause",
  "version",
  "category",
  "measuredItem",
] as const;

export const META_KEY_MAP: Record<string, (typeof REQUIRED_META_KEYS)[number]> = {
  规范来源: "norm",
  条款号: "clause",
  版本: "version",
  分类: "category",
  检测项: "measuredItem",
};

export const REQUIRED_SECTIONS: Array<{ key: LintSectionKey; sectionName: string; required: boolean }> = [
  { key: "inputs", sectionName: "输入参数", required: true },
  { key: "outputs", sectionName: "输出参数", required: true },
  { key: "calculations", sectionName: "计算步骤", required: true },
  { key: "rules", sectionName: "判定规则", required: true },
  { key: "signatures", sectionName: "签字要求", required: true },
  { key: "dependsOn", sectionName: "依赖", required: false },
];

export const SUPPORTED_INPUT_TYPES = new Set(["number", "string", "boolean"]);
export const SUPPORTED_RULE_OPERATORS = new Set([">=", "<=", ">", "<", "==", "!="]);
