import yaml from "js-yaml";

import type {
  CalculationTrace,
  ExecutionResult,
  GateResult,
  InputField,
  PathStep,
  Proof,
  ProofConfig,
  Rule,
  SPU,
} from "./spu-types.ts";

export class SPULoader {
  private static readonly cache = new Map<string, SPU>();
  private static readonly IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
  private static readonly UNSAFE_EXPRESSION_PATTERN = /[^0-9A-Za-z_+\-*/%().,\s^]/;
  private static readonly UNSAFE_KEYWORD_PATTERN =
    /\b(?:new|this|function|class|while|for|if|else|return|import|export|await|yield|globalThis|window|document|constructor|prototype|__proto__)\b/;
  private static readonly EXPRESSION_HELPERS: Record<string, (...args: number[]) => number> = {
    abs: Math.abs,
    ceil: Math.ceil,
    floor: Math.floor,
    max: Math.max,
    min: Math.min,
    pow: Math.pow,
    round: Math.round,
    sqrt: Math.sqrt,
  };

  load(yamlContent: string): SPU {
    const parsed = yaml.load(yamlContent);
    if (!this.isRecord(parsed)) {
      throw new Error("SPU YAML must be an object");
    }

    const spu = parsed as unknown as SPU;
    this.validate(spu);
    SPULoader.cache.set(spu.spuId, spu);
    return spu;
  }

  execute(spuId: string, inputs: Record<string, number>): ExecutionResult {
    const spu = SPULoader.cache.get(spuId);
    if (!spu) {
      throw new Error(`SPU not loaded: ${spuId}`);
    }
    if (!this.isRecord(inputs)) {
      throw new Error("inputs must be an object");
    }

    this.validateRequiredInputs(spu.data.inputs, inputs);

    const context: Record<string, number> = { ...inputs };
    const trace: CalculationTrace[] = [];

    for (const step of spu.path) {
      const stepResult = this.executeStep(step, context);
      context[stepResult.field] = stepResult.output;
      trace.push(stepResult.trace);
    }

    const outputs = this.collectOutputs(spu, context);
    const gateResults = spu.rules.map((rule) => this.evaluateRule(rule, outputs, inputs));
    const status: "PASS" | "FAIL" = gateResults.every((rule) => rule.passed) ? "PASS" : "FAIL";
    const proof = this.generateProof(spu, outputs, status, trace, gateResults);

    return {
      spuId: spu.spuId,
      status,
      inputs: { ...inputs },
      outputs,
      trace,
      gateResults,
      proof,
    };
  }

  static getSPU(spuId: string): SPU | undefined {
    return SPULoader.cache.get(spuId);
  }

  private validate(spu: SPU): void {
    if (!this.isNonEmptyString(spu.spuId)) {
      throw new Error("spuId is required");
    }
    if (!Array.isArray(spu.forms) || spu.forms.length === 0) {
      throw new Error("forms is required");
    }
    if (!Array.isArray(spu.path) || spu.path.length === 0) {
      throw new Error("path is required");
    }
    if (!this.isRecord(spu.meta)) {
      throw new Error("meta is required");
    }
    if (!this.isRecord(spu.data) || !Array.isArray(spu.data.inputs) || !Array.isArray(spu.data.outputs)) {
      throw new Error("data is required");
    }
    if (!Array.isArray(spu.rules)) {
      throw new Error("rules is required");
    }
    if (!this.isRecord(spu.proof)) {
      throw new Error("proof is required");
    }

    for (const step of spu.path) {
      const formula = this.parseFormula(step.formula);
      this.assertIdentifier(formula.field, "formula output");
      const normalizedExpression = this.normalizeExpression(formula.expression);
      const expressionIdentifiers = this.extractExpressionIdentifiers(normalizedExpression);
      const scopeKeys = expressionIdentifiers.filter((item) => !(item in SPULoader.EXPRESSION_HELPERS));
      this.compileExpression(normalizedExpression, scopeKeys);
    }
  }

  private validateRequiredInputs(fields: InputField[], inputs: Record<string, number>): void {
    for (const field of fields) {
      if (!(field.name in inputs)) {
        throw new Error(`missing required input: ${field.name}`);
      }
    }
  }

  private executeStep(
    step: PathStep,
    context: Record<string, number>,
  ): { field: string; output: number; trace: CalculationTrace } {
    const formula = this.parseFormula(step.formula);
    const referencedKeys = this.extractReferencedInputs(formula.expression, context);
    const rawValue = this.evaluateExpression(formula.expression, context);
    if (typeof rawValue !== "number" || Number.isNaN(rawValue)) {
      throw new Error(`formula must return a number: ${step.formula}`);
    }

    const output = this.roundTo4(rawValue);
    return {
      field: formula.field,
      output,
      trace: {
        step: step.step,
        formula: step.formula,
        inputs: referencedKeys,
        output,
      },
    };
  }

  private evaluateRule(rule: Rule, outputs: Record<string, number>, inputs: Record<string, number>): GateResult {
    const value = outputs[rule.field];
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new Error(`rule field is missing or invalid: ${rule.field}`);
    }

    const threshold = this.resolveRuleValue(rule.value, inputs);
    const passed = this.compare(value, rule.operator, threshold);
    return {
      ruleId: rule.ruleId,
      field: rule.field,
      value,
      threshold,
      operator: rule.operator,
      passed,
      message: passed ? undefined : rule.message,
    };
  }

  private generateProof(
    spu: SPU,
    outputs: Record<string, number>,
    status: "PASS" | "FAIL",
    calculationTrace: CalculationTrace[],
    gateDecisions: GateResult[],
  ): Proof {
    const proof = spu.proof as ProofConfig;
    const resultValue = outputs[proof.resultField];
    if (typeof resultValue !== "number" || Number.isNaN(resultValue)) {
      throw new Error(`proof.resultField is missing in outputs: ${proof.resultField}`);
    }

    return {
      spuId: spu.spuId,
      norm: spu.meta.norm,
      clause: spu.meta.clause,
      timestamp: new Date().toISOString(),
      result: {
        field: proof.resultField,
        value: resultValue,
        status,
      },
      message: status === "PASS" ? proof.passMessage : proof.failMessage,
      calculationTrace,
      gateDecisions,
      requiredSignatures: [...proof.requiredSignatures],
      pendingSignatures: status === "PASS" ? [...proof.requiredSignatures] : [],
    };
  }

  private collectOutputs(spu: SPU, context: Record<string, number>): Record<string, number> {
    const outputs: Record<string, number> = {};

    for (const item of spu.data.outputs) {
      const name = item.name;
      if (typeof context[name] !== "number" || Number.isNaN(context[name])) {
        throw new Error(`output is missing after path execution: ${name}`);
      }
      outputs[name] = this.roundTo4(context[name]);
    }

    return outputs;
  }

  private parseFormula(formula: string): { field: string; expression: string } {
    if (!this.isNonEmptyString(formula)) {
      throw new Error("formula is required");
    }
    const parts = formula.split("=");
    if (parts.length !== 2) {
      throw new Error(`formula must match "output = expression": ${formula}`);
    }

    const field = parts[0]?.trim();
    const expression = parts[1]?.trim();
    if (!this.isNonEmptyString(field) || !this.isNonEmptyString(expression)) {
      throw new Error(`formula must match "output = expression": ${formula}`);
    }

    return { field, expression };
  }

  private evaluateExpression(expression: string, context: Record<string, number>): number {
    const normalizedExpression = this.normalizeExpression(expression);
    const contextKeys = Object.keys(context);
    const evaluator = this.compileExpression(normalizedExpression, contextKeys);
    const helperValues = Object.values(SPULoader.EXPRESSION_HELPERS);
    const contextValues = contextKeys.map((key) => context[key]);
    const rawValue = evaluator(...helperValues, ...contextValues);
    if (typeof rawValue !== "number") {
      throw new Error(`formula must resolve to a numeric value: ${expression}`);
    }
    return rawValue;
  }

  private compileExpression(
    normalizedExpression: string,
    contextKeys: string[],
  ): (...args: unknown[]) => number {
    for (const key of contextKeys) {
      this.assertIdentifier(key, "formula variable");
    }
    const helperKeys = Object.keys(SPULoader.EXPRESSION_HELPERS);
    const argumentNames = [...helperKeys, ...contextKeys];
    return new Function(...argumentNames, `"use strict"; return (${normalizedExpression});`) as (
      ...args: unknown[]
    ) => number;
  }

  private normalizeExpression(expression: string): string {
    if (!this.isNonEmptyString(expression)) {
      throw new Error("formula expression is required");
    }
    if (SPULoader.UNSAFE_EXPRESSION_PATTERN.test(expression)) {
      throw new Error(`formula contains unsupported characters: ${expression}`);
    }
    if (SPULoader.UNSAFE_KEYWORD_PATTERN.test(expression)) {
      throw new Error(`formula contains unsupported keyword: ${expression}`);
    }
    return expression.replace(/\^/g, "**");
  }

  private extractExpressionIdentifiers(expression: string): string[] {
    const matches = expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
    return Array.from(new Set(matches));
  }

  private assertIdentifier(value: string, targetLabel: string): void {
    if (!SPULoader.IDENTIFIER_PATTERN.test(value)) {
      throw new Error(`${targetLabel} must be a valid identifier: ${value}`);
    }
  }

  private extractReferencedInputs(expression: string, context: Record<string, number>): Record<string, number> {
    const scope: Record<string, number> = {};
    for (const key of Object.keys(context)) {
      const matcher = new RegExp(`\\b${this.escapeRegExp(key)}\\b`);
      if (matcher.test(expression)) {
        scope[key] = context[key];
      }
    }
    return scope;
  }

  private compare(left: number, operator: Rule["operator"], right: number): boolean {
    switch (operator) {
      case ">=":
        return left >= right;
      case "<=":
        return left <= right;
      case ">":
        return left > right;
      case "<":
        return left < right;
      case "==":
        return left === right;
      case "!=":
        return left !== right;
      default:
        throw new Error(`unsupported operator: ${operator}`);
    }
  }

  private resolveRuleValue(value: Rule["value"], inputs: Record<string, number>): number {
    if (typeof value === "number") {
      return value;
    }

    if (typeof value === "string" && value.startsWith("**INPUT**:")) {
      const inputKey = value.slice("**INPUT**:".length);
      const threshold = inputs[inputKey];
      if (typeof threshold !== "number" || Number.isNaN(threshold)) {
        throw new Error(`rule threshold input is missing or invalid: ${inputKey}`);
      }
      return threshold;
    }

    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      throw new Error(`unsupported rule value: ${String(value)}`);
    }
    return parsed;
  }

  private roundTo4(value: number): number {
    return Number(value.toFixed(4));
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
  }
}
