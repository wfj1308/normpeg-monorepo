import type {
  ExternalInputMappingRule,
  ExternalInputValidationStatus,
} from "../../src/platform/types.ts";

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return undefined;
}

function isScalar(value: unknown): value is number | string | boolean | null {
  return value === null || typeof value === "number" || typeof value === "string" || typeof value === "boolean";
}

function normalizeRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const entries = Object.entries(raw as Record<string, unknown>)
    .map(([key, value]) => [key.trim(), value] as const)
    .filter(([key]) => key.length > 0);
  if (entries.length === 0) {
    return null;
  }
  return Object.fromEntries(entries);
}

export function normalizeExternalInputMappingRules(value: unknown): ExternalInputMappingRule[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const rules: ExternalInputMappingRule[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const sourceField = normalizeText((raw as Record<string, unknown>).sourceField);
    const targetInput = normalizeText((raw as Record<string, unknown>).targetInput);
    if (!sourceField || !targetInput) {
      continue;
    }
    const typeHintValue = (raw as Record<string, unknown>).typeHint;
    const typeHint =
      typeHintValue === "number" || typeHintValue === "string" || typeHintValue === "boolean" || typeHintValue === "auto"
        ? typeHintValue
        : undefined;
    const defaultValueRaw = (raw as Record<string, unknown>).defaultValue;
    const required = normalizeBoolean((raw as Record<string, unknown>).required);
    rules.push({
      sourceField,
      targetInput,
      typeHint,
      required,
      defaultValue: isScalar(defaultValueRaw) ? defaultValueRaw : undefined,
    });
  }
  return rules;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      const next = line[index + 1];
      if (inQuotes && next === "\"") {
        current += "\"";
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (inQuotes) {
    throw new Error("CSV quoted field is not closed");
  }
  cells.push(current);
  return cells;
}

export function parseCsvImportRecords(csvText: string): Array<Record<string, unknown>> {
  const normalizedText = String(csvText ?? "").replace(/^\uFEFF/, "");
  const lines = normalizedText
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error("CSV must contain header and at least one data row");
  }
  const headers = splitCsvLine(lines[0]).map((item) => item.trim());
  if (headers.some((item) => item.length === 0)) {
    throw new Error("CSV header contains empty column name");
  }
  if (new Set(headers).size !== headers.length) {
    throw new Error("CSV header contains duplicate column names");
  }

  const records: Array<Record<string, unknown>> = [];
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const cells = splitCsvLine(lines[lineIndex]);
    if (cells.length > headers.length) {
      throw new Error(`CSV row ${lineIndex + 1} has more columns than header`);
    }
    const record: Record<string, unknown> = {};
    let hasValue = false;
    for (let index = 0; index < headers.length; index += 1) {
      const value = String(cells[index] ?? "").trim();
      if (value.length > 0) {
        hasValue = true;
      }
      record[headers[index]] = value;
    }
    if (hasValue) {
      records.push(record);
    }
  }
  if (records.length === 0) {
    throw new Error("CSV has no usable data rows");
  }
  return records;
}

export function normalizeJsonImportRecords(value: unknown): Array<Record<string, unknown>> {
  const candidate = value as Record<string, unknown> | undefined;
  const rawRecords =
    Array.isArray(value) ? value
      : Array.isArray(candidate?.records) ? candidate.records
      : Array.isArray(candidate?.items) ? candidate.items
      : candidate && typeof candidate === "object" ? [candidate]
      : [];

  const records = rawRecords
    .map((item) => normalizeRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
  if (records.length === 0) {
    throw new Error("JSON import requires object records");
  }
  return records;
}

export function buildExternalInputValidationStatus(params: {
  mappingRules: ExternalInputMappingRule[];
  records: Array<Record<string, unknown>>;
}): ExternalInputValidationStatus {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (params.mappingRules.length === 0) {
    errors.push("mappingRules is required");
  }
  if (params.records.length === 0) {
    errors.push("records is required");
  }

  const targetInputs = new Set<string>();
  for (const rule of params.mappingRules) {
    if (targetInputs.has(rule.targetInput)) {
      errors.push(`duplicate targetInput mapping: ${rule.targetInput}`);
      continue;
    }
    targetInputs.add(rule.targetInput);
  }

  const sampleRecord = params.records[0] ?? {};
  const sampleKeys = new Set(Object.keys(sampleRecord));
  for (const rule of params.mappingRules) {
    if (!sampleKeys.has(rule.sourceField)) {
      warnings.push(`sourceField not found in sample record: ${rule.sourceField}`);
    }
  }

  return {
    status: errors.length > 0 ? "invalid" : warnings.length > 0 ? "warning" : "valid",
    errors,
    warnings,
    validatedAt: nowIso(),
  };
}
