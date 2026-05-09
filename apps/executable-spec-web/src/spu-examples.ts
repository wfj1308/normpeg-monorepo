import { SPULoader } from "./spu-loader.ts";

import type { SPU } from "./spu-types.ts";

const loader = new SPULoader();

const SUBGRADE_COMPACTION_YAML = `spuId: "highway.subgrade.compaction.4.2.1.soil@v1"

meta:
  name: "路基压实度（土质）"
  norm: "JTG F80/1-2017"
  clause: "4.2.1"
  version: "v1"

forms:
  - formCode: "SUBGRADE_COMPACTION_FORM"
    role: "lab"
    required: true

data:
  inputs:
    - name: massHoleSand
      type: number
      label: "灌入砂质量(g)"
    - name: massSandCone
      type: number
      label: "锥体砂质量(g)"
    - name: volumeSand
      type: number
      label: "标定体积(cm3)"
    - name: moistureContent
      type: number
      label: "含水率(%)"
    - name: maxDryDensity
      type: number
      label: "最大干密度(g/cm3)"
  outputs:
    - name: wetDensity
    - name: dryDensity
    - name: compactionDegree

path:
  - step: calc_wet_density
    formula: "wetDensity = massHoleSand / volumeSand"
  - step: calc_dry_density
    formula: "dryDensity = wetDensity / (1 + moistureContent / 100)"
  - step: calc_compaction
    formula: "compactionDegree = (dryDensity / maxDryDensity) * 100"

rules:
  - ruleId: "RULE-COMPACTION-001"
    field: "compactionDegree"
    operator: ">="
    value: 93
    message: "压实度必须 >= 93%"

proof:
  resultField: "compactionDegree"
  passMessage: "压实度达标"
  failMessage: "压实度不达标"
  requiredSignatures:
    - lab
    - supervision
`;

const SUBGRADE_DEFLECTION_YAML = `spuId: "highway.subgrade.deflection.4.2.2@v1"

meta:
  name: "路基弯沉"
  norm: "JTG F80/1-2017"
  clause: "4.2.2"
  version: "v1"

forms:
  - formCode: "SUBGRADE_DEFLECTION_FORM"
    role: "lab"
    required: true

data:
  inputs:
    - name: measuredDeflection
      type: number
      label: "实测弯沉(0.01mm)"
    - name: allowableDeflection
      type: number
      label: "允许弯沉(0.01mm)"
  outputs:
    - name: deflectionValue
    - name: deflectionMargin

path:
  - step: calc_deflection_value
    formula: "deflectionValue = measuredDeflection"
  - step: calc_deflection_margin
    formula: "deflectionMargin = allowableDeflection - deflectionValue"

rules:
  - ruleId: "RULE-DEFLECTION-001"
    field: "deflectionValue"
    operator: "<="
    value: 210
    message: "弯沉不得大于允许值"

proof:
  resultField: "deflectionValue"
  passMessage: "弯沉达标"
  failMessage: "弯沉不达标"
  requiredSignatures:
    - lab
    - supervision
`;

const SUBGRADE_THICKNESS_YAML = `spuId: "highway.subgrade.thickness.4.2.3@v1"

meta:
  name: "路基厚度"
  norm: "JTG F80/1-2017"
  clause: "4.2.3"
  version: "v1"

forms:
  - formCode: "SUBGRADE_THICKNESS_FORM"
    role: "lab"
    required: true

data:
  inputs:
    - name: measuredThickness
      type: number
      label: "实测厚度(mm)"
    - name: designThickness
      type: number
      label: "设计厚度(mm)"
  outputs:
    - name: thicknessValue
    - name: thicknessRatio

path:
  - step: calc_thickness_value
    formula: "thicknessValue = measuredThickness"
  - step: calc_thickness_ratio
    formula: "thicknessRatio = (thicknessValue / designThickness) * 100"

rules:
  - ruleId: "RULE-THICKNESS-001"
    field: "thicknessValue"
    operator: ">="
    value: 180
    message: "实测厚度必须满足设计厚度"

proof:
  resultField: "thicknessValue"
  passMessage: "厚度达标"
  failMessage: "厚度不达标"
  requiredSignatures:
    - lab
    - supervision
`;

const BRIDGE_PILE_STRENGTH_YAML = `spuId: "highway.bridge.pile.strength.quality@v1"

meta:
  name: "桥梁桩基强度"
  norm: "JTG/T 3650-2020"
  clause: "6.3.4"
  version: "v1"

forms:
  - formCode: "BRIDGE_PILE_STRENGTH_FORM"
    role: "lab"
    required: true

data:
  inputs:
    - name: measuredStrength
      type: number
      label: "实测抗压强度(MPa)"
    - name: designStrength
      type: number
      label: "设计强度(MPa)"
    - name: pileLength
      type: number
      label: "桩长(m)"
  outputs:
    - name: pileStrength
    - name: strengthRatio
    - name: lengthCheck

path:
  - step: calc_pile_strength
    formula: "pileStrength = measuredStrength"
  - step: calc_strength_ratio
    formula: "strengthRatio = (pileStrength / designStrength) * 100"
  - step: calc_length_check
    formula: "lengthCheck = pileLength"

rules:
  - ruleId: "RULE-PILE-STRENGTH-001"
    field: "strengthRatio"
    operator: ">="
    value: 100
    message: "桩基强度必须达到设计强度"

proof:
  resultField: "strengthRatio"
  passMessage: "桩基强度达标"
  failMessage: "桩基强度不达标"
  requiredSignatures:
    - lab
    - supervision
`;

const PAVEMENT_FLATNESS_YAML = `spuId: "highway.pavement.flatness.4.2.9@v1"

meta:
  name: "路面平整度"
  norm: "JTG F80/1-2017"
  clause: "4.2.9"
  version: "v1"

forms:
  - formCode: "PAVEMENT_FLATNESS_FORM"
    role: "lab"
    required: true

data:
  inputs:
    - name: measuredFlatness
      type: number
      label: "实测平整度(mm)"
    - name: maxAllowedFlatness
      type: number
      label: "允许平整度(mm)"
  outputs:
    - name: flatnessValue
    - name: flatnessMargin

path:
  - step: calc_flatness_value
    formula: "flatnessValue = measuredFlatness"
  - step: calc_flatness_margin
    formula: "flatnessMargin = maxAllowedFlatness - flatnessValue"

rules:
  - ruleId: "RULE-FLATNESS-001"
    field: "flatnessValue"
    operator: "<="
    value: "**INPUT**:maxAllowedFlatness"
    message: "平整度必须 <= 允许值"

proof:
  resultField: "flatnessValue"
  passMessage: "平整度达标"
  failMessage: "平整度不达标"
  requiredSignatures:
    - lab
    - supervision
`;

export type SPUExample = {
  spu: SPU;
  passInputs: Record<string, number>;
  failInputs: Record<string, number>;
};

const subgradeCompaction = loader.load(SUBGRADE_COMPACTION_YAML) as SPU;
const subgradeDeflection = loader.load(SUBGRADE_DEFLECTION_YAML) as SPU;
const subgradeThickness = loader.load(SUBGRADE_THICKNESS_YAML) as SPU;
const bridgePileStrength = loader.load(BRIDGE_PILE_STRENGTH_YAML) as SPU;
const pavementFlatness = loader.load(PAVEMENT_FLATNESS_YAML) as SPU;

export const SPU_EXAMPLES: SPUExample[] = [
  {
    spu: subgradeCompaction,
    passInputs: {
      massHoleSand: 1980,
      massSandCone: 500,
      volumeSand: 1000,
      moistureContent: 5,
      maxDryDensity: 1.95,
    },
    failInputs: {
      massHoleSand: 1500,
      massSandCone: 500,
      volumeSand: 1000,
      moistureContent: 12,
      maxDryDensity: 1.95,
    },
  },
  {
    spu: subgradeDeflection,
    passInputs: {
      measuredDeflection: 198,
      allowableDeflection: 210,
    },
    failInputs: {
      measuredDeflection: 228,
      allowableDeflection: 210,
    },
  },
  {
    spu: subgradeThickness,
    passInputs: {
      measuredThickness: 185,
      designThickness: 180,
    },
    failInputs: {
      measuredThickness: 172,
      designThickness: 180,
    },
  },
  {
    spu: bridgePileStrength,
    passInputs: {
      measuredStrength: 42,
      designStrength: 40,
      pileLength: 18,
    },
    failInputs: {
      measuredStrength: 36,
      designStrength: 40,
      pileLength: 18,
    },
  },
  {
    spu: pavementFlatness,
    passInputs: {
      measuredFlatness: 7.2,
      maxAllowedFlatness: 8,
    },
    failInputs: {
      measuredFlatness: 9.6,
      maxAllowedFlatness: 8,
    },
  },
];

export function getSPUExample(spuId: string): SPUExample {
  const match = SPU_EXAMPLES.find((item) => item.spu.spuId === spuId);
  if (!match) {
    throw new Error(`SPU example not found: ${spuId}`);
  }
  return match;
}

export function findSPUExample(spuId: string): SPUExample | undefined {
  return SPU_EXAMPLES.find((item) => item.spu.spuId === spuId);
}
