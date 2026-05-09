import type { GateResult, RuleDefinition, RuleResult } from "../types.ts";

function compare(left: unknown, operator: RuleDefinition["operator"], right: unknown): boolean {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  switch (operator) {
    case ">=":
      if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) {
        throw new Error(`rule compare expects numeric values for operator ${operator}`);
      }
      return leftNumber >= rightNumber;
    case ">":
      if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) {
        throw new Error(`rule compare expects numeric values for operator ${operator}`);
      }
      return leftNumber > rightNumber;
    case "<=":
      if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) {
        throw new Error(`rule compare expects numeric values for operator ${operator}`);
      }
      return leftNumber <= rightNumber;
    case "<":
      if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) {
        throw new Error(`rule compare expects numeric values for operator ${operator}`);
      }
      return leftNumber < rightNumber;
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    default:
      throw new Error(`unsupported operator: ${String(operator)}`);
  }
}

function resolveThreshold(
  rule: RuleDefinition,
  inputs: Record<string, unknown>,
  outputs: Record<string, unknown>,
): number | string | boolean {
  const threshold = rule.threshold;
  if (threshold === undefined) {
    const value = rule.value;
    if (value === undefined) {
      throw new Error("rule threshold/value is required");
    }
    if (typeof value === "string") {
      // Compatibility: if legacy rule.value points to a field name, resolve from inputs/outputs first.
      if (Object.prototype.hasOwnProperty.call(inputs, value)) {
        return inputs[value] as number | string | boolean;
      }
      if (Object.prototype.hasOwnProperty.call(outputs, value)) {
        return outputs[value] as number | string | boolean;
      }
    }
    return value;
  }
  if (typeof threshold === "number" || typeof threshold === "string" || typeof threshold === "boolean") {
    return threshold;
  }
  if (threshold.inputRef) {
    const value = inputs[threshold.inputRef];
    if (value === undefined) {
      throw new Error(`rule threshold inputRef not found: ${threshold.inputRef}`);
    }
    return value as number | string | boolean;
  }
  if (threshold.outputRef) {
    const value = outputs[threshold.outputRef];
    if (value === undefined) {
      throw new Error(`rule threshold outputRef not found: ${threshold.outputRef}`);
    }
    return value as number | string | boolean;
  }
  if (threshold.value === undefined) {
    throw new Error("rule threshold config is invalid");
  }
  return threshold.value;
}

export class RuleEngine {
  evaluate(
    rules: RuleDefinition[],
    inputs: Record<string, unknown>,
    outputs: Record<string, unknown>,
  ): GateResult {
    const results: RuleResult[] = rules.map((rule) => {
      const actual = outputs[rule.field];
      if (actual === undefined) {
        throw new Error(`rule field output not found: ${rule.field}`);
      }
      const threshold = resolveThreshold(rule, inputs, outputs);
      const passed = compare(actual, rule.operator, threshold);
      return {
        ruleId: rule.ruleId ?? `${rule.field}-${rule.operator}`,
        field: rule.field,
        operator: rule.operator,
        threshold: threshold as number | string | boolean,
        actual: actual as number | string | boolean,
        passed,
        message: rule.message,
      };
    });

    const passed = results.every((item) => item.passed);
    return {
      passed,
      decision: passed ? "PASS" : "BLOCK",
      override: null,
      results,
    };
  }
}
