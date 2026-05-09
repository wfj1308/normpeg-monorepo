import type { SpecMarkdownTemplate } from "./types.ts";

const SUBGRADE_COMPACTION_SOIL_TEMPLATE: SpecMarkdownTemplate = {
  templateId: "subgrade-compaction-soil",
  baseType: "subgrade.compaction",
  name: "路基压实度（土质）",
  category: "subgrade",
  description: "土质路基压实度检测规范模板",
  reusableFields: [
    { key: "norm", target: "meta", description: "Standard source" },
    { key: "clause", target: "meta", description: "Clause number" },
    { key: "version", target: "meta", description: "Version" },
    { key: "category", target: "meta", description: "Category" },
    { key: "measuredItem", target: "meta", description: "Measured item" },
    { key: "description", target: "rule", description: "Rule explanation" },
  ],
  rulePlaceholders: [
    { key: "threshold", field: "compactionDegree", operator: ">=", placeholderType: "threshold", description: "Compaction threshold" },
    { key: "description", field: "compactionDegree", operator: ">=", placeholderType: "message", description: "Rule description" },
  ],
  defaultProofRequirements: ["lab", "supervision"],
  variables: [
    { key: "norm", label: "规范来源", type: "string", required: true, defaultValue: "JTG F80/1-2017" },
    { key: "clause", label: "条款号", type: "string", required: true, defaultValue: "4.2.1" },
    { key: "version", label: "版本", type: "string", required: true, defaultValue: "v1" },
    { key: "category", label: "分类", type: "string", required: true, defaultValue: "subgrade" },
    { key: "measuredItem", label: "检测项", type: "string", required: true, defaultValue: "compaction" },
    { key: "description", label: "Description", type: "string", required: false, defaultValue: "derived from template" },
    { key: "threshold", label: "压实度阈值(%)", type: "number", required: true, defaultValue: 93 },
  ],
  markdownTemplate: `# 路基压实度（土质）

规范来源：{{norm}}
条款号：{{clause}}
版本：{{version}}
分类：{{category}}
检测项：{{measuredItem}}

## 输入参数
- massHoleSand | number | g | 灌入砂质量
- volumeSand | number | cm3 | 标定体积
- moistureContent | number | % | 含水率
- maxDryDensity | number | g/cm3 | 最大干密度

## 输出参数
- wetDensity
- dryDensity
- compactionDegree

## 计算步骤
1. wetDensity = massHoleSand / volumeSand
2. dryDensity = wetDensity / (1 + moistureContent / 100)
3. compactionDegree = (dryDensity / maxDryDensity) * 100

## 判定规则
- compactionDegree >= {{threshold}} | 压实度必须 ≥ {{threshold}}% {{description}}

## 签字要求
- lab
- supervision

## 依赖
- none
`,
};

const SUBGRADE_THICKNESS_TEMPLATE: SpecMarkdownTemplate = {
  templateId: "subgrade-thickness",
  baseType: "subgrade.thickness",
  name: "路基厚度",
  category: "subgrade",
  description: "路基厚度检测规范模板",
  reusableFields: [
    { key: "norm", target: "meta", description: "Standard source" },
    { key: "clause", target: "meta", description: "Clause number" },
    { key: "version", target: "meta", description: "Version" },
    { key: "category", target: "meta", description: "Category" },
    { key: "measuredItem", target: "meta", description: "Measured item" },
    { key: "description", target: "rule", description: "Rule explanation" },
  ],
  rulePlaceholders: [
    { key: "designThickness", field: "measuredThickness", operator: ">=", placeholderType: "threshold", description: "Thickness threshold" },
    { key: "description", field: "measuredThickness", operator: ">=", placeholderType: "message", description: "Rule description" },
  ],
  defaultProofRequirements: ["lab", "supervision"],
  variables: [
    { key: "norm", label: "规范来源", type: "string", required: true, defaultValue: "JTG F80/1-2017" },
    { key: "clause", label: "条款号", type: "string", required: true, defaultValue: "4.2.3" },
    { key: "version", label: "版本", type: "string", required: true, defaultValue: "v1" },
    { key: "category", label: "分类", type: "string", required: true, defaultValue: "subgrade" },
    { key: "measuredItem", label: "检测项", type: "string", required: true, defaultValue: "thickness" },
    { key: "description", label: "Description", type: "string", required: false, defaultValue: "derived from template" },
    { key: "designThickness", label: "设计厚度(mm)", type: "number", required: true, defaultValue: 200 },
  ],
  markdownTemplate: `# 路基厚度

规范来源：{{norm}}
条款号：{{clause}}
版本：{{version}}
分类：{{category}}
检测项：{{measuredItem}}

## 输入参数
- measuredThickness | number | mm | 实测厚度
- designThickness | number | mm | 设计厚度

## 输出参数
- thicknessDeviation
- thicknessRatio

## 计算步骤
1. thicknessDeviation = measuredThickness - designThickness
2. thicknessRatio = (measuredThickness / designThickness) * 100

## 判定规则
- measuredThickness >= {{designThickness}} | 实测厚度不得小于 {{designThickness}}mm {{description}}

## 签字要求
- lab
- supervision

## 依赖
- none
`,
};

const SUBGRADE_DEFLECTION_TEMPLATE: SpecMarkdownTemplate = {
  templateId: "subgrade-deflection",
  baseType: "subgrade.deflection",
  name: "路基弯沉",
  category: "subgrade",
  description: "路基弯沉检测规范模板",
  reusableFields: [
    { key: "norm", target: "meta", description: "Standard source" },
    { key: "clause", target: "meta", description: "Clause number" },
    { key: "version", target: "meta", description: "Version" },
    { key: "category", target: "meta", description: "Category" },
    { key: "measuredItem", target: "meta", description: "Measured item" },
    { key: "description", target: "rule", description: "Rule explanation" },
  ],
  rulePlaceholders: [
    { key: "maxAllowedDeflection", field: "measuredDeflection", operator: "<=", placeholderType: "threshold", description: "Deflection threshold" },
    { key: "description", field: "measuredDeflection", operator: "<=", placeholderType: "message", description: "Rule description" },
  ],
  defaultProofRequirements: ["lab", "supervision"],
  variables: [
    { key: "norm", label: "规范来源", type: "string", required: true, defaultValue: "JTG F80/1-2017" },
    { key: "clause", label: "条款号", type: "string", required: true, defaultValue: "4.2.2" },
    { key: "version", label: "版本", type: "string", required: true, defaultValue: "v1" },
    { key: "category", label: "分类", type: "string", required: true, defaultValue: "subgrade" },
    { key: "measuredItem", label: "检测项", type: "string", required: true, defaultValue: "deflection" },
    { key: "description", label: "Description", type: "string", required: false, defaultValue: "derived from template" },
    { key: "maxAllowedDeflection", label: "允许最大弯沉(0.01mm)", type: "number", required: true, defaultValue: 20 },
  ],
  markdownTemplate: `# 路基弯沉

规范来源：{{norm}}
条款号：{{clause}}
版本：{{version}}
分类：{{category}}
检测项：{{measuredItem}}

## 输入参数
- measuredDeflection | number | 0.01mm | 实测弯沉
- maxAllowedDeflection | number | 0.01mm | 允许最大弯沉

## 输出参数
- deflectionMargin

## 计算步骤
1. deflectionMargin = maxAllowedDeflection - measuredDeflection

## 判定规则
- measuredDeflection <= {{maxAllowedDeflection}} | 弯沉值必须 ≤ {{maxAllowedDeflection}} {{description}}

## 签字要求
- lab
- supervision

## 依赖
- none
`,
};

const BUILTIN_TEMPLATES: SpecMarkdownTemplate[] = [
  SUBGRADE_COMPACTION_SOIL_TEMPLATE,
  SUBGRADE_THICKNESS_TEMPLATE,
  SUBGRADE_DEFLECTION_TEMPLATE,
];

export function getBuiltInTemplates(): SpecMarkdownTemplate[] {
  return BUILTIN_TEMPLATES.map((template) => structuredClone(template));
}
