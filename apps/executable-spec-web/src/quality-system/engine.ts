import type {
  CalculationStep,
  CompactionInputs,
  CompactionOutputs,
  GateResult,
  RuleResult,
} from "./models.ts";

export const COMPACTION_GATE_THRESHOLD = 93;

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function assertPositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} 必须是大于 0 的数字`);
  }
}

export function calculateWetDensity(inputs: CompactionInputs): number {
  assertPositive("volumeSand", inputs.volumeSand);
  return round4(inputs.massHoleSand / inputs.volumeSand);
}

export function calculateDryDensity(wetDensity: number, inputs: CompactionInputs): number {
  return round4(wetDensity / (1 + inputs.moistureContent / 100));
}

export function calculateCompactionDegree(dryDensity: number, inputs: CompactionInputs): number {
  assertPositive("maxDryDensity", inputs.maxDryDensity);
  return round4((dryDensity / inputs.maxDryDensity) * 100);
}

export function executeCompactionPath(inputs: CompactionInputs): {
  outputs: CompactionOutputs;
  trace: CalculationStep[];
} {
  const wetDensity = calculateWetDensity(inputs);
  const dryDensity = calculateDryDensity(wetDensity, inputs);
  const compactionDegree = calculateCompactionDegree(dryDensity, inputs);

  const trace: CalculationStep[] = [
    {
      step: "calc_wet_density",
      formula: "wetDensity = massHoleSand / volumeSand",
      result: wetDensity,
    },
    {
      step: "calc_dry_density",
      formula: "dryDensity = wetDensity / (1 + moistureContent / 100)",
      result: dryDensity,
    },
    {
      step: "calc_compaction_degree",
      formula: "compactionDegree = (dryDensity / maxDryDensity) * 100",
      result: compactionDegree,
    },
  ];

  return {
    outputs: {
      wetDensity,
      dryDensity,
      compactionDegree,
    },
    trace,
  };
}

export function evaluateCompactionGate(outputs: CompactionOutputs): GateResult {
  const actual = outputs.compactionDegree;
  const passed = actual >= COMPACTION_GATE_THRESHOLD;
  const result: RuleResult = {
    field: "compactionDegree",
    operator: ">=",
    threshold: COMPACTION_GATE_THRESHOLD,
    actual,
    passed,
    message: passed
      ? `压实度 ${actual.toFixed(2)}%，满足 compactionDegree >= ${COMPACTION_GATE_THRESHOLD}%`
      : `压实度 ${actual.toFixed(2)}%，不满足 compactionDegree >= ${COMPACTION_GATE_THRESHOLD}%`,
  };

  return {
    passed,
    results: [result],
  };
}

export function recommendPassInputs(seed: Partial<CompactionInputs>): CompactionInputs | null {
  const volumeSand = seed.volumeSand ?? 0;
  const moistureContent = seed.moistureContent ?? 0;
  const maxDryDensity = seed.maxDryDensity ?? 0;
  const massSandCone = seed.massSandCone ?? 500;
  if (volumeSand <= 0 || maxDryDensity <= 0) {
    return null;
  }

  const requiredMassHoleSand = COMPACTION_GATE_THRESHOLD / 100 * maxDryDensity * (1 + moistureContent / 100) * volumeSand;
  const roundedMassHoleSand = round4(requiredMassHoleSand + 0.0001);
  return {
    massHoleSand: roundedMassHoleSand,
    massSandCone,
    volumeSand,
    moistureContent,
    maxDryDensity,
  };
}
