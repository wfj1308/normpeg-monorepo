import assert from "node:assert/strict";
import test from "node:test";

import { DRAFT_SECTION_ORDER } from "../review/markdown_section_parser.ts";
import { DEFAULT_RULE_CONFIG } from "./rule_config.ts";
import { applyDiffRuleConfig, applyPreRegisterGateConfig } from "./validation_rerun.ts";

const [TITLE, SOURCE, CLAUSE, VERSION, CATEGORY, SUBJECT, INPUTS, OUTPUTS, CALC, RULES, SIGNATURES, DEPENDS] = DRAFT_SECTION_ORDER;

const BASE_MARKDOWN = `# 示例
${SOURCE}: JTG F80/1-2017
${CLAUSE}: 4.2.1
${VERSION}: v1
${CATEGORY}: subgrade
${SUBJECT}: compaction

## ${INPUTS}
- inputA | number | mm | 说明

## ${OUTPUTS}
- outputA

## ${CALC}
1. outputA = inputA

## ${RULES}
- outputA >= 93 | 阈值

## ${SIGNATURES}
- lab

## ${DEPENDS}
- none
`;

test("applyDiffRuleConfig: 可按配置降级章节风险", () => {
  const edited = BASE_MARKDOWN.replace(">= 93", ">= 95");
  const config = {
    ...DEFAULT_RULE_CONFIG.diff,
    highRiskSections: DEFAULT_RULE_CONFIG.diff.highRiskSections.filter((item) => item !== "rules"),
    mediumRiskSections: [...DEFAULT_RULE_CONFIG.diff.mediumRiskSections, "rules"],
  };
  const review = applyDiffRuleConfig(config, BASE_MARKDOWN, edited);
  const ruleChange = review.sectionChanges.find((item) => item.section === RULES);
  assert.equal(ruleChange?.riskLevel, "medium");
});

test("applyPreRegisterGateConfig: 可关闭高风险 diff 告警", () => {
  const edited = BASE_MARKDOWN.replace(">= 93", ">= 95");
  const decision = applyPreRegisterGateConfig(
    {
      ...DEFAULT_RULE_CONFIG.gate,
      warnOnHighRiskDiff: false,
    },
    {
      warnings: [{ code: "OCR_USED", message: "OCR used" }],
      originalDraftMarkdown: BASE_MARKDOWN,
      editedMarkdown: edited,
      clauseReviewItems: [],
    },
  );
  assert.equal(decision.status, "ready");
});
