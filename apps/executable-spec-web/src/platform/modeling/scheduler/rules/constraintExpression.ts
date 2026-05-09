type ExpressionContextValue = string | number | boolean | null | undefined;

export interface ExpressionContext {
  [key: string]: ExpressionContextValue;
}

function normalizeExpression(raw: string): string {
  return String(raw || "")
    .replace(/\band\b/gi, "&&")
    .replace(/\bor\b/gi, "||")
    .trim();
}

function splitTopLevelByOperator(expression: string, operator: "&&" | "||"): string[] {
  const source = String(expression || "");
  const parts: string[] = [];
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let start = 0;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (char === "\"" && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (inSingleQuote || inDoubleQuote) {
      continue;
    }
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0 && char === operator[0] && next === operator[1]) {
      parts.push(source.slice(start, i).trim());
      start = i + 2;
      i += 1;
    }
  }

  const tail = source.slice(start).trim();
  if (tail) {
    parts.push(tail);
  }
  return parts.length > 0 ? parts : [source.trim()];
}

function trimOuterParentheses(text: string): string {
  let source = String(text || "").trim();
  while (source.startsWith("(") && source.endsWith(")")) {
    let depth = 0;
    let wrapped = true;
    for (let i = 0; i < source.length; i += 1) {
      const char = source[i];
      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
      }
      if (depth === 0 && i < source.length - 1) {
        wrapped = false;
        break;
      }
    }
    if (!wrapped) {
      break;
    }
    source = source.slice(1, -1).trim();
  }
  return source;
}

function stripQuotes(value: string): string {
  const source = String(value || "").trim();
  if ((source.startsWith("\"") && source.endsWith("\"")) || (source.startsWith("'") && source.endsWith("'"))) {
    return source.slice(1, -1).trim();
  }
  return source;
}

function parseTimeMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

function parseNumber(value: string): number | null {
  const source = String(value || "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(source)) {
    return null;
  }
  const parsed = Number(source);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveContextValue(context: ExpressionContext, key: string): ExpressionContextValue {
  const target = String(key || "").trim();
  if (!target) {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(context, target)) {
    return context[target];
  }

  const lowered = target.toLowerCase();
  const normalized = lowered.replace(/[-.]/g, "_");
  for (const [rawKey, rawValue] of Object.entries(context)) {
    const candidate = rawKey.toLowerCase();
    if (candidate === lowered || candidate.replace(/[-.]/g, "_") === normalized) {
      return rawValue;
    }
  }
  return undefined;
}

function asComparable(value: ExpressionContextValue): { kind: "number" | "time" | "string"; value: number | string } | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return { kind: "number", value };
  }
  if (typeof value === "boolean") {
    return { kind: "number", value: value ? 1 : 0 };
  }

  const text = String(value).trim();
  const numberValue = parseNumber(text);
  if (numberValue !== null) {
    return { kind: "number", value: numberValue };
  }
  const timeValue = parseTimeMinutes(text);
  if (timeValue !== null) {
    return { kind: "time", value: timeValue };
  }
  return { kind: "string", value: text.toLowerCase() };
}

function asComparableLiteral(value: string): { kind: "number" | "time" | "string"; value: number | string } {
  const text = stripQuotes(String(value || "").trim());
  const numberValue = parseNumber(text);
  if (numberValue !== null) {
    return { kind: "number", value: numberValue };
  }
  const timeValue = parseTimeMinutes(text);
  if (timeValue !== null) {
    return { kind: "time", value: timeValue };
  }
  return { kind: "string", value: text.toLowerCase() };
}

function compareByOperator(
  left: { kind: "number" | "time" | "string"; value: number | string },
  right: { kind: "number" | "time" | "string"; value: number | string },
  operator: "==" | "=" | "!=" | ">=" | "<=" | ">" | "<",
): boolean {
  if (operator === "==" || operator === "=") {
    return left.value === right.value;
  }
  if (operator === "!=") {
    return left.value !== right.value;
  }

  // Ordered operators only apply to numeric/time values.
  if (typeof left.value !== "number" || typeof right.value !== "number") {
    return true;
  }
  if (operator === ">=") {
    return left.value >= right.value;
  }
  if (operator === "<=") {
    return left.value <= right.value;
  }
  if (operator === ">") {
    return left.value > right.value;
  }
  if (operator === "<") {
    return left.value < right.value;
  }
  return true;
}

function evaluatePredicate(predicate: string, context: ExpressionContext): boolean {
  const source = trimOuterParentheses(predicate);
  if (!source) {
    return true;
  }

  const betweenMatch = /^between\(\s*([a-zA-Z0-9_.-]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i.exec(source);
  if (betweenMatch) {
    const leftValue = asComparable(resolveContextValue(context, betweenMatch[1]));
    if (!leftValue || typeof leftValue.value !== "number") {
      return true;
    }
    const minValue = asComparableLiteral(betweenMatch[2]);
    const maxValue = asComparableLiteral(betweenMatch[3]);
    if (typeof minValue.value !== "number" || typeof maxValue.value !== "number") {
      return true;
    }
    return leftValue.value >= minValue.value && leftValue.value <= maxValue.value;
  }

  const inMatch = /^([a-zA-Z0-9_.-]+)\s+(not\s+in|in)\s*(.+)$/i.exec(source);
  if (inMatch) {
    const leftValue = asComparable(resolveContextValue(context, inMatch[1]));
    if (!leftValue) {
      return true;
    }
    const mode = inMatch[2].toLowerCase().replace(/\s+/g, "");
    let listSource = String(inMatch[3] || "").trim();
    if (
      (listSource.startsWith("(") && listSource.endsWith(")")) ||
      (listSource.startsWith("[") && listSource.endsWith("]"))
    ) {
      listSource = listSource.slice(1, -1);
    }
    const candidates = listSource
      .split(",")
      .map((item) => asComparableLiteral(item))
      .map((item) => item.value);
    const contains = candidates.includes(leftValue.value);
    return mode === "in" ? contains : !contains;
  }

  const comparisonMatch = /^([a-zA-Z0-9_.-]+)\s*(==|=|!=|>=|<=|>|<)\s*(.+)$/.exec(source);
  if (comparisonMatch) {
    const leftValue = asComparable(resolveContextValue(context, comparisonMatch[1]));
    if (!leftValue) {
      return true;
    }
    const rightValue = asComparableLiteral(comparisonMatch[3]);
    return compareByOperator(
      leftValue,
      rightValue,
      comparisonMatch[2] as "==" | "=" | "!=" | ">=" | "<=" | ">" | "<",
    );
  }

  // Bare identifier means truthy check on context field.
  if (/^[a-zA-Z0-9_.-]+$/.test(source)) {
    const value = resolveContextValue(context, source);
    if (value === null || value === undefined) {
      return true;
    }
    if (typeof value === "boolean") {
      return value;
    }
    return String(value).trim().length > 0;
  }

  // Unknown pattern: keep scheduler non-blocking for backward compatibility.
  return true;
}

function evaluateAnd(expression: string, context: ExpressionContext): boolean {
  const parts = splitTopLevelByOperator(expression, "&&").filter(Boolean);
  return parts.every((item) => evaluateLogical(item, context));
}

function evaluateLogical(expression: string, context: ExpressionContext): boolean {
  const source = trimOuterParentheses(expression);
  const orParts = splitTopLevelByOperator(source, "||").filter(Boolean);
  if (orParts.length > 1) {
    return orParts.some((item) => evaluateAnd(item, context));
  }
  return evaluatePredicate(source, context);
}

export function evaluateConstraintExpression(expression: string, context: ExpressionContext): boolean {
  const source = normalizeExpression(expression);
  if (!source) {
    return true;
  }
  return evaluateLogical(source, context);
}

