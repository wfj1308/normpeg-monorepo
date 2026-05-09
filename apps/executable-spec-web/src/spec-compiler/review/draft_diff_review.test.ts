import assert from "node:assert/strict";
import test from "node:test";

import { buildDraftDiffReview } from "./draft_diff_review.ts";
import { classifySectionRisk } from "./risk_classifier.ts";
import { splitMarkdownIntoSections } from "./markdown_section_parser.ts";

const BASE_DRAFT = `# 路基压实度（土质）

规范来源：JTG F80/1-2017
条款号：4.2.1
版本：v1
分类：subgrade
检测项：compaction

## 输入参数
- massHoleSand | number | g | 灌入砂质量
- volumeSand | number | cm3 | 标定体积

## 输出参数
- wetDensity
- compactionDegree

## 计算步骤
1. wetDensity = massHoleSand / volumeSand
2. compactionDegree = wetDensity * 100

## 判定规则
- compactionDegree >= 93 | 压实度必须 ≥ 93%

## 签字要求
- lab
- supervision

## 依赖
- none
`;

test("splitMarkdownIntoSections: 能识别模板章节", () => {
  const sections = splitMarkdownIntoSections(BASE_DRAFT);
  assert.equal(sections["标题"][0], "路基压实度（土质）");
  assert.equal(sections["规范来源"][0], "JTG F80/1-2017");
  assert.ok(sections["判定规则"][0]?.includes("compactionDegree"));
});

test("场景1：仅修改标题 -> low risk", () => {
  const edited = BASE_DRAFT.replace("路基压实度（土质）", "路基压实度（土质）- 复核版");
  const review = buildDraftDiffReview(BASE_DRAFT, edited);
  const titleChange = review.sectionChanges.find((item) => item.section === "标题");
  assert.equal(review.hasChanges, true);
  assert.equal(titleChange?.riskLevel, "low");
});

test("场景2：修改判定阈值 93->95 -> high risk 且提示阈值变化", () => {
  const edited = BASE_DRAFT.replace(">= 93", ">= 95").replace("≥ 93%", "≥ 95%");
  const review = buildDraftDiffReview(BASE_DRAFT, edited);
  const ruleChange = review.sectionChanges.find((item) => item.section === "判定规则");
  assert.equal(ruleChange?.riskLevel, "high");
  assert.equal(ruleChange?.message, "判定阈值发生变化，请重点确认");
});

test("场景3：补全输入参数 -> medium risk", () => {
  const edited = BASE_DRAFT.replace(
    "- volumeSand | number | cm3 | 标定体积",
    "- volumeSand | number | cm3 | 标定体积\n- moistureContent | number | % | 含水率",
  );
  const review = buildDraftDiffReview(BASE_DRAFT, edited);
  const inputChange = review.sectionChanges.find((item) => item.section === "输入参数");
  assert.equal(inputChange?.riskLevel, "medium");
});

test("classifySectionRisk: 风险分级符合规则", () => {
  assert.equal(classifySectionRisk("条款号"), "high");
  assert.equal(classifySectionRisk("输入参数"), "medium");
  assert.equal(classifySectionRisk("版本"), "low");
});
