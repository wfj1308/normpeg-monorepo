import type { SPUDefinition } from "../types.ts";

export const BUILTIN_SPUS: SPUDefinition[] = [
  {
    spuId: "highway.subgrade.compaction.4.2.1@v1",
    meta: {
      name: "路基压实度",
      norm: "JTG F80/1-2017",
      clause: "4.2.1",
      version: "v1",
      category: "路基",
      workItem: "土方",
      measuredItem: "压实度",
    },
    forms: [
      {
        formCode: "SUBGRADE_COMPACTION_FORM",
        role: "lab",
        required: true,
        title: "灌砂法压实度表单",
      },
    ],
    data: {
      inputs: [
        { name: "massHoleSand", type: "number", label: "灌入试坑砂质量", unit: "g" },
        { name: "massSandCone", type: "number", label: "锥体砂质量", unit: "g" },
        { name: "volumeSand", type: "number", label: "试坑体积", unit: "cm3" },
        { name: "moistureContent", type: "number", label: "含水率", unit: "%" },
        { name: "maxDryDensity", type: "number", label: "最大干密度", unit: "g/cm3" },
      ],
      outputs: [
        { name: "wetDensity", label: "湿密度", unit: "g/cm3" },
        { name: "dryDensity", label: "干密度", unit: "g/cm3" },
        { name: "compactionDegree", label: "压实度", unit: "%" },
      ],
    },
    path: [
      { step: "calc_wet_density", formula: "wetDensity = massHoleSand / volumeSand" },
      { step: "calc_dry_density", formula: "dryDensity = wetDensity / (1 + moistureContent / 100)" },
      { step: "calc_compaction_degree", formula: "compactionDegree = (dryDensity / maxDryDensity) * 100" },
    ],
    rules: [
      {
        ruleId: "RULE-COMPACTION-001",
        field: "compactionDegree",
        operator: ">=",
        threshold: 93,
        message: "压实度应不小于 93%",
      },
    ],
    proof: {
      resultField: "compactionDegree",
      requiredSignatures: ["lab", "supervision"],
      schemaVersion: "node-proof@v1",
      extensions: {
        method: "sand-cone",
      },
    },
    sourceType: "builtin",
  },
  {
    spuId: "highway.subgrade.thickness.4.2.3@v1",
    meta: {
      name: "路基厚度",
      norm: "JTG F80/1-2017",
      clause: "4.2.3",
      version: "v1",
      category: "路基",
      workItem: "填筑",
      measuredItem: "厚度",
    },
    forms: [
      {
        formCode: "SUBGRADE_THICKNESS_FORM",
        role: "lab",
        required: true,
        title: "路基厚度检测表单",
      },
    ],
    data: {
      inputs: [
        { name: "measuredThickness", type: "number", label: "实测厚度", unit: "mm" },
        { name: "designThickness", type: "number", label: "设计厚度", unit: "mm" },
      ],
      outputs: [
        { name: "thicknessValue", label: "厚度值", unit: "mm" },
        { name: "thicknessRatio", label: "厚度比", unit: "%" },
      ],
    },
    path: [
      { step: "resolve_thickness", formula: "thicknessValue = measuredThickness" },
      { step: "calc_thickness_ratio", formula: "thicknessRatio = (measuredThickness / designThickness) * 100" },
    ],
    rules: [
      {
        ruleId: "RULE-THICKNESS-001",
        field: "thicknessValue",
        operator: ">=",
        threshold: { inputRef: "designThickness" },
        message: "实测厚度应不小于设计厚度",
      },
    ],
    proof: {
      resultField: "thicknessValue",
      requiredSignatures: ["lab", "supervision"],
      schemaVersion: "node-proof@v1",
    },
    sourceType: "builtin",
  },
  {
    spuId: "highway.subgrade.deflection.4.2.2@v1",
    meta: {
      name: "路基弯沉",
      norm: "JTG F80/1-2017",
      clause: "4.2.2",
      version: "v1",
      category: "路基",
      workItem: "弯沉检测",
      measuredItem: "弯沉",
    },
    forms: [
      {
        formCode: "SUBGRADE_DEFLECTION_FORM",
        role: "lab",
        required: true,
        title: "路基弯沉检测表单",
      },
    ],
    data: {
      inputs: [
        { name: "deflectionValue", type: "number", label: "实测弯沉", unit: "0.01mm" },
        { name: "maxAllowedDeflection", type: "number", label: "允许最大弯沉", unit: "0.01mm" },
      ],
      outputs: [{ name: "deflectionOutput", label: "弯沉值", unit: "0.01mm" }],
    },
    path: [{ step: "resolve_deflection", formula: "deflectionOutput = deflectionValue" }],
    rules: [
      {
        ruleId: "RULE-DEFLECTION-001",
        field: "deflectionOutput",
        operator: "<=",
        threshold: { inputRef: "maxAllowedDeflection" },
        message: "实测弯沉应不大于允许值",
      },
    ],
    proof: {
      resultField: "deflectionOutput",
      requiredSignatures: ["lab", "supervision"],
      schemaVersion: "node-proof@v1",
    },
    sourceType: "builtin",
  },
];
