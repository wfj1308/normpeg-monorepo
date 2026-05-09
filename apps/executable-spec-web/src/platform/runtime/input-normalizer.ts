import type {
  FieldType,
  InputField,
  InputRangeCheck,
  InputUnitConversion,
  SPUDefinition,
} from "../types.ts";

interface InputValidationHint {
  required?: boolean;
  min?: number;
  max?: number;
  unit?: string;
  acceptedUnits?: string[];
}

export interface InputValidationIssue {
  field: string;
  code: "missing" | "type" | "range" | "unit";
  message: string;
}

export interface InputNormalizationResult {
  normalizedInputs: Record<string, unknown>;
  conversions: InputUnitConversion[];
  rangeChecks: InputRangeCheck[];
}

export class InputValidationError extends Error {
  readonly code = "SPU_INPUT_INVALID" as const;
  constructor(
    public readonly issues: InputValidationIssue[],
    message?: string,
  ) {
    super(message ?? issues.map((item) => `${item.field}: ${item.message}`).join("; "));
    this.name = "InputValidationError";
  }
}

interface UnitDefinition {
  dimension: "length" | "mass" | "volume" | "density" | "ratio";
  factorToBase: number;
}

const UNIT_ALIAS_MAP: Readonly<Record<string, string>> = {
  "%": "%",
  percent: "%",
  percentage: "%",
  pct: "%",
  ratio: "ratio",
  mm: "mm",
  millimeter: "mm",
  millimetre: "mm",
  cm: "cm",
  m: "m",
  mg: "mg",
  g: "g",
  kg: "kg",
  ton: "t",
  tonne: "t",
  t: "t",
  mm3: "mm3",
  "mm^3": "mm3",
  cm3: "cm3",
  "cm^3": "cm3",
  cc: "cm3",
  ml: "cm3",
  l: "l",
  liter: "l",
  litre: "l",
  m3: "m3",
  "m^3": "m3",
  "g/cm3": "g/cm3",
  "g/cm^3": "g/cm3",
  "g/cc": "g/cm3",
  "kg/m3": "kg/m3",
  "kg/m^3": "kg/m3",
  "0.01mm": "0.01mm",
};

const UNIT_DEFINITIONS: Readonly<Record<string, UnitDefinition>> = {
  "%": { dimension: "ratio", factorToBase: 1 },
  ratio: { dimension: "ratio", factorToBase: 100 },
  mm: { dimension: "length", factorToBase: 1 },
  cm: { dimension: "length", factorToBase: 10 },
  m: { dimension: "length", factorToBase: 1000 },
  "0.01mm": { dimension: "length", factorToBase: 0.01 },
  mg: { dimension: "mass", factorToBase: 0.001 },
  g: { dimension: "mass", factorToBase: 1 },
  kg: { dimension: "mass", factorToBase: 1000 },
  t: { dimension: "mass", factorToBase: 1_000_000 },
  mm3: { dimension: "volume", factorToBase: 0.001 },
  cm3: { dimension: "volume", factorToBase: 1 },
  l: { dimension: "volume", factorToBase: 1000 },
  m3: { dimension: "volume", factorToBase: 1_000_000 },
  "kg/m3": { dimension: "density", factorToBase: 1 },
  "g/cm3": { dimension: "density", factorToBase: 1000 },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeUnitToken(value: string | undefined | null): string | null {
  const token = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (!token) {
    return null;
  }
  return UNIT_ALIAS_MAP[token] ?? token;
}

function nowIso(): string {
  return new Date().toISOString();
}

function readValidationHint(spu: SPUDefinition, field: InputField): InputValidationHint {
  const extensionMap = isRecord(spu.meta.extensions?.inputValidation)
    ? (spu.meta.extensions?.inputValidation as Record<string, unknown>)
    : {};
  const rawHint = extensionMap[field.name];
  const hintObj = isRecord(rawHint) ? rawHint : {};

  const acceptedUnits = Array.isArray(hintObj.acceptedUnits)
    ? hintObj.acceptedUnits.map((item) => String(item)).filter(Boolean)
    : Array.isArray(field.acceptedUnits)
    ? field.acceptedUnits.map((item) => String(item)).filter(Boolean)
    : [];

  return {
    required: typeof hintObj.required === "boolean" ? hintObj.required : field.required,
    min: typeof hintObj.min === "number" && Number.isFinite(hintObj.min)
      ? hintObj.min
      : typeof field.range?.min === "number" && Number.isFinite(field.range.min)
      ? field.range.min
      : undefined,
    max: typeof hintObj.max === "number" && Number.isFinite(hintObj.max)
      ? hintObj.max
      : typeof field.range?.max === "number" && Number.isFinite(field.range.max)
      ? field.range.max
      : undefined,
    unit: typeof hintObj.unit === "string" && hintObj.unit.trim().length > 0 ? hintObj.unit : field.unit,
    acceptedUnits,
  };
}

function isMissingValue(value: unknown): boolean {
  if (value === null || typeof value === "undefined") {
    return true;
  }
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  return false;
}

function defaultRangeByUnit(unit: string | null): { min?: number; max?: number } {
  if (!unit) {
    return {};
  }
  if (unit === "%") {
    return { min: 0, max: 100 };
  }
  if (unit === "ratio") {
    return { min: 0, max: 1 };
  }
  if (
    unit === "mm" ||
    unit === "cm" ||
    unit === "m" ||
    unit === "0.01mm" ||
    unit === "mg" ||
    unit === "g" ||
    unit === "kg" ||
    unit === "t" ||
    unit === "mm3" ||
    unit === "cm3" ||
    unit === "l" ||
    unit === "m3" ||
    unit === "kg/m3" ||
    unit === "g/cm3"
  ) {
    return { min: 0 };
  }
  return {};
}

function parseNumberWithOptionalUnit(value: unknown): { ok: boolean; numeric?: number; unit?: string | null } {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return { ok: false };
    }
    return { ok: true, numeric: value, unit: null };
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return { ok: false };
    }
    const matched = trimmed.match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)(?:\s*([^\s]+))?$/);
    if (!matched) {
      return { ok: false };
    }
    const numeric = Number(matched[1]);
    if (!Number.isFinite(numeric)) {
      return { ok: false };
    }
    return {
      ok: true,
      numeric,
      unit: matched[2] ?? null,
    };
  }

  if (isRecord(value) && (Object.prototype.hasOwnProperty.call(value, "value") || Object.prototype.hasOwnProperty.call(value, "unit"))) {
    const rawNumber = parseNumberWithOptionalUnit(value.value);
    if (!rawNumber.ok || typeof rawNumber.numeric !== "number") {
      return { ok: false };
    }
    const explicitUnit = typeof value.unit === "string" ? value.unit : null;
    return {
      ok: true,
      numeric: rawNumber.numeric,
      unit: explicitUnit ?? rawNumber.unit ?? null,
    };
  }

  return { ok: false };
}

function convertNumberUnit(params: {
  fieldName: string;
  value: number;
  fromUnit: string | null;
  toUnit: string | null;
  acceptedUnits: string[];
  conversions: InputUnitConversion[];
  issues: InputValidationIssue[];
}): number {
  const normalizedTo = normalizeUnitToken(params.toUnit);
  const normalizedFrom = normalizeUnitToken(params.fromUnit) ?? normalizedTo;

  if (!normalizedTo || !normalizedFrom || normalizedTo === normalizedFrom) {
    return params.value;
  }

  const accepted = params.acceptedUnits.map((item) => normalizeUnitToken(item)).filter(Boolean);
  if (accepted.length > 0 && !accepted.includes(normalizedFrom)) {
    params.issues.push({
      field: params.fieldName,
      code: "unit",
      message: `unit ${normalizedFrom} is not allowed; accepted: ${accepted.join(", ")}`,
    });
    return params.value;
  }

  const fromDef = UNIT_DEFINITIONS[normalizedFrom];
  const toDef = UNIT_DEFINITIONS[normalizedTo];
  if (!fromDef || !toDef || fromDef.dimension !== toDef.dimension) {
    params.issues.push({
      field: params.fieldName,
      code: "unit",
      message: `cannot convert unit from ${normalizedFrom} to ${normalizedTo}`,
    });
    return params.value;
  }

  const normalizedValue = Number(((params.value * fromDef.factorToBase) / toDef.factorToBase).toFixed(6));
  params.conversions.push({
    field: params.fieldName,
    fromUnit: normalizedFrom,
    toUnit: normalizedTo,
    originalValue: params.value,
    normalizedValue,
  });
  return normalizedValue;
}

function coerceBoolean(fieldName: string, value: unknown, issues: InputValidationIssue[]): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }
  }
  issues.push({
    field: fieldName,
    code: "type",
    message: "expected boolean",
  });
  return undefined;
}

function applyNumberRangeCheck(params: {
  fieldName: string;
  value: number;
  min?: number;
  max?: number;
  unit: string | null;
  rangeChecks: InputRangeCheck[];
  issues: InputValidationIssue[];
}): void {
  const defaults = defaultRangeByUnit(params.unit);
  const min = typeof params.min === "number" ? params.min : defaults.min;
  const max = typeof params.max === "number" ? params.max : defaults.max;

  if (typeof min === "number" && params.value < min) {
    params.issues.push({
      field: params.fieldName,
      code: "range",
      message: `value ${params.value} is less than min ${min}`,
    });
    return;
  }
  if (typeof max === "number" && params.value > max) {
    params.issues.push({
      field: params.fieldName,
      code: "range",
      message: `value ${params.value} is greater than max ${max}`,
    });
    return;
  }

  params.rangeChecks.push({
    field: params.fieldName,
    value: params.value,
    min: typeof min === "number" ? min : null,
    max: typeof max === "number" ? max : null,
  });
}

function normalizeField(
  field: InputField,
  fieldType: FieldType,
  rawValue: unknown,
  hint: InputValidationHint,
  issues: InputValidationIssue[],
  conversions: InputUnitConversion[],
  rangeChecks: InputRangeCheck[],
): unknown {
  if (fieldType === "string") {
    if (rawValue === null || typeof rawValue === "undefined") {
      issues.push({ field: field.name, code: "type", message: "expected string" });
      return undefined;
    }
    const normalized = String(rawValue).trim();
    if (!normalized) {
      issues.push({ field: field.name, code: "type", message: "string must not be empty" });
      return undefined;
    }
    return normalized;
  }

  if (fieldType === "boolean") {
    return coerceBoolean(field.name, rawValue, issues);
  }

  const parsed = parseNumberWithOptionalUnit(rawValue);
  if (!parsed.ok || typeof parsed.numeric !== "number") {
    issues.push({
      field: field.name,
      code: "type",
      message: "expected number",
    });
    return undefined;
  }

  const targetUnit = normalizeUnitToken(hint.unit ?? field.unit ?? null);
  const normalizedValue = convertNumberUnit({
    fieldName: field.name,
    value: parsed.numeric,
    fromUnit: parsed.unit ?? null,
    toUnit: targetUnit,
    acceptedUnits: hint.acceptedUnits ?? [],
    conversions,
    issues,
  });

  applyNumberRangeCheck({
    fieldName: field.name,
    value: normalizedValue,
    min: hint.min,
    max: hint.max,
    unit: targetUnit,
    rangeChecks,
    issues,
  });

  return normalizedValue;
}

export function validateAndNormalizeSpuInputs(
  spu: SPUDefinition,
  rawInputs: Record<string, unknown>,
): InputNormalizationResult {
  const normalizedInputs: Record<string, unknown> = {};
  const issues: InputValidationIssue[] = [];
  const conversions: InputUnitConversion[] = [];
  const rangeChecks: InputRangeCheck[] = [];

  for (const [key, value] of Object.entries(rawInputs)) {
    if (key.startsWith("__")) {
      normalizedInputs[key] = value;
    }
  }

  for (const field of spu.data.inputs) {
    const hint = readValidationHint(spu, field);
    const required = hint.required !== false;
    const rawValue = rawInputs[field.name];

    if (isMissingValue(rawValue)) {
      if (required) {
        issues.push({
          field: field.name,
          code: "missing",
          message: "required input is missing",
        });
      }
      continue;
    }

    const normalized = normalizeField(
      field,
      field.type,
      rawValue,
      hint,
      issues,
      conversions,
      rangeChecks,
    );
    if (typeof normalized !== "undefined") {
      normalizedInputs[field.name] = normalized;
    }
  }

  if (issues.length > 0) {
    throw new InputValidationError(
      issues,
      `SPU input validation failed for ${spu.spuId}`,
    );
  }

  return {
    normalizedInputs,
    conversions,
    rangeChecks,
  };
}

export function buildInputValidationSnapshot(params: InputNormalizationResult) {
  return {
    validatedAt: nowIso(),
    normalizedInputs: { ...params.normalizedInputs },
    conversions: [...params.conversions],
    rangeChecks: [...params.rangeChecks],
  };
}
