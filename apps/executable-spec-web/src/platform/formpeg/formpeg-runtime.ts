import { RuleEngine } from "../runtime/rule-engine.ts";
import {
  InputValidationError,
  type InputNormalizationResult,
  type InputValidationIssue,
  validateAndNormalizeSpuInputs,
} from "../runtime/input-normalizer.ts";
import type { CalculationTrace, GateResult, SPUDefinition } from "../types.ts";

export interface FormPegFieldSchema {
  name: string;
  label: string;
  type: SPUDefinition["data"]["inputs"][number]["type"];
  unit: string | null;
  required: boolean;
  range: {
    min: number | null;
    max: number | null;
  };
  acceptedUnits: string[];
}

export interface FormPegSchema {
  spuId: string;
  spuName: string;
  fields: FormPegFieldSchema[];
}

export interface FormPegPreviewResult {
  ready: boolean;
  hasInput: boolean;
  normalizedInputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  trace: CalculationTrace[];
  gate: GateResult;
  missingFields: string[];
  validationIssues: InputValidationIssue[];
  normalization: InputNormalizationResult | null;
  message: string | null;
}

const RESERVED_IDENTIFIERS = new Set([
  "true",
  "false",
  "null",
  "undefined",
  "NaN",
  "Infinity",
]);

function nowIso(): string {
  return new Date().toISOString();
}

function roundResult(value: unknown): unknown {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number(value.toFixed(6));
  }
  return value;
}

function parseFormula(formula: string): { output: string; expression: string } {
  const index = formula.indexOf("=");
  if (index < 0) {
    throw new Error(`Invalid formula: ${formula}`);
  }
  const output = formula.slice(0, index).trim();
  const expression = formula.slice(index + 1).trim();
  if (!output || !expression) {
    throw new Error(`Invalid formula: ${formula}`);
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(output)) {
    throw new Error(`Invalid output field in formula: ${formula}`);
  }
  return { output, expression };
}

function extractExpressionVariables(expression: string): string[] {
  const matched = expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  const unique = new Set<string>();
  for (const token of matched) {
    if (!RESERVED_IDENTIFIERS.has(token)) {
      unique.add(token);
    }
  }
  return [...unique];
}

function evaluateExpression(expression: string, context: Record<string, unknown>): unknown {
  const variables = extractExpressionVariables(expression);
  const keys: string[] = [];
  const values: unknown[] = [];

  for (const variable of variables) {
    if (variable === "Math") {
      keys.push("Math");
      values.push(Math);
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(context, variable)) {
      throw new Error(`Formula variable not found in context: ${variable}`);
    }
    keys.push(variable);
    values.push(context[variable]);
  }

  const evaluator = new Function(...keys, '"use strict"; return (' + expression + ");");
  return evaluator(...values);
}

function buildFormPegPathResult(
  spu: SPUDefinition,
  normalizedInputs: Record<string, unknown>,
): {
  outputs: Record<string, unknown>;
  trace: CalculationTrace[];
} {
  const outputs: Record<string, unknown> = {};
  const context: Record<string, unknown> = { ...normalizedInputs };
  const trace: CalculationTrace[] = [];

  for (let index = 0; index < spu.path.length; index += 1) {
    const step = spu.path[index];
    const { output, expression } = parseFormula(step.formula);
    const startedAt = nowIso();
    const inputSnapshot = { ...context };
    const result = roundResult(evaluateExpression(expression, inputSnapshot));
    context[output] = result;
    outputs[output] = result;
    const completedAt = nowIso();
    trace.push({
      step: step.step,
      formula: step.formula,
      context: { ...context },
      result: result as number | string | boolean,
      stepIndex: index,
      inputSnapshot,
      outputField: output,
      startedAt,
      completedAt,
    });
  }

  return {
    outputs,
    trace,
  };
}

export function buildFormPegSchema(spu: SPUDefinition): FormPegSchema {
  return {
    spuId: spu.spuId,
    spuName: spu.meta.name,
    fields: spu.data.inputs.map((field) => ({
      name: field.name,
      label: field.label,
      type: field.type,
      unit: field.unit ?? null,
      required: field.required !== false,
      range: {
        min: typeof field.range?.min === "number" ? field.range.min : null,
        max: typeof field.range?.max === "number" ? field.range.max : null,
      },
      acceptedUnits: Array.isArray(field.acceptedUnits) ? [...field.acceptedUnits] : [],
    })),
  };
}

export function buildFormPegPreview(spu: SPUDefinition, rawInputs: Record<string, unknown>): FormPegPreviewResult {
  const hasInput = Object.values(rawInputs).some((value) => {
    if (value === null || typeof value === "undefined") {
      return false;
    }
    if (typeof value === "string") {
      return value.trim().length > 0;
    }
    return true;
  });

  let normalized: InputNormalizationResult;
  try {
    normalized = validateAndNormalizeSpuInputs(spu, rawInputs);
  } catch (reason) {
    if (reason instanceof InputValidationError) {
      return {
        ready: false,
        hasInput,
        normalizedInputs: {},
        outputs: {},
        trace: [],
        gate: {
          passed: false,
          decision: "BLOCK",
          override: null,
          results: [],
        },
        missingFields: reason.issues.filter((item) => item.code === "missing").map((item) => item.field),
        validationIssues: reason.issues,
        normalization: null,
        message: reason.message,
      };
    }
    return {
      ready: false,
      hasInput,
      normalizedInputs: {},
      outputs: {},
      trace: [],
      gate: {
        passed: false,
        decision: "BLOCK",
        override: null,
        results: [],
      },
      missingFields: [],
      validationIssues: [
        {
          field: "_form",
          code: "type",
          message: reason instanceof Error ? reason.message : String(reason),
        },
      ],
      normalization: null,
      message: reason instanceof Error ? reason.message : String(reason),
    };
  }

  try {
    const pathResult = buildFormPegPathResult(spu, normalized.normalizedInputs);
    const gate = new RuleEngine().evaluate(spu.rules, normalized.normalizedInputs, pathResult.outputs);
    return {
      ready: true,
      hasInput,
      normalizedInputs: { ...normalized.normalizedInputs },
      outputs: pathResult.outputs,
      trace: pathResult.trace,
      gate,
      missingFields: [],
      validationIssues: [],
      normalization: normalized,
      message: null,
    };
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason);
    return {
      ready: false,
      hasInput,
      normalizedInputs: { ...normalized.normalizedInputs },
      outputs: {},
      trace: [],
      gate: {
        passed: false,
        decision: "BLOCK",
        override: null,
        results: [],
      },
      missingFields: [],
      validationIssues: [
        {
          field: "_path",
          code: "type",
          message,
        },
      ],
      normalization: normalized,
      message,
    };
  }
}
