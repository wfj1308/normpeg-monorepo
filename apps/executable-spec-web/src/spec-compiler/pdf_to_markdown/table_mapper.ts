import type { ExtractedInputField, ExtractedRule, ExtractedTableBlock } from "./types.ts";

function normalizeUnit(unit: string): string {
  return unit
    .trim()
    .replace(/立方厘米/g, "cm3")
    .replace(/百分比|百分率/g, "%")
    .replace(/克每立方厘米/g, "g/cm3")
    .replace(/\s+/g, " ") || "-";
}

function normalizeOperator(value: string): ExtractedRule["operator"] | null {
  const normalized = value
    .replace(/[≥﹥]/g, ">=")
    .replace(/[≤﹤]/g, "<=")
    .replace(/[＝]/g, "==")
    .trim();
  if (normalized.includes(">=")) {
    return ">=";
  }
  if (normalized.includes("<=")) {
    return "<=";
  }
  if (normalized.includes("!=")) {
    return "!=";
  }
  if (normalized.includes("==")) {
    return "==";
  }
  if (/>/.test(normalized)) {
    return ">";
  }
  if (/< /.test(normalized) || /</.test(normalized)) {
    return "<";
  }
  return null;
}

function normalizeFieldName(name: string): string {
  return name
    .trim()
    .replace(/[()（）【】[\]]/g, "")
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9_]+/g, " ")
    .trim();
}

function parseNumericOrText(value: string): number | string {
  const normalized = value.trim();
  const numeric = Number(normalized.replace(/%$/, ""));
  if (!Number.isNaN(numeric) && normalized !== "") {
    return numeric;
  }
  return normalized;
}

export function tableToInputs(block: ExtractedTableBlock): ExtractedInputField[] {
  if (block.type !== "parameter_table") {
    return [];
  }
  const headers = block.headers.map((item) => item.trim());
  const nameIndex = headers.findIndex((header) => /参数|项目|名称|字段/.test(header));
  const unitIndex = headers.findIndex((header) => /单位/.test(header));
  const labelIndex = headers.findIndex((header) => /说明|备注|描述/.test(header));

  return block.rows
    .map((row): ExtractedInputField | null => {
      const nameCell = row[nameIndex >= 0 ? nameIndex : 0] ?? "";
      if (!nameCell.trim()) {
        return null;
      }
      const unitCell = unitIndex >= 0 ? row[unitIndex] ?? "-" : "-";
      const labelCell = labelIndex >= 0 ? row[labelIndex] ?? nameCell : nameCell;
      const input: ExtractedInputField = {
        name: normalizeFieldName(nameCell),
        type: "number",
        unit: normalizeUnit(unitCell),
        label: labelCell.trim() || nameCell.trim(),
      };
      return input;
    })
    .filter((item): item is ExtractedInputField => item !== null);
}

function parseRuleFromRow(rowText: string): ExtractedRule | null {
  const rulePattern = /([\u4e00-\u9fa5A-Za-z_][\u4e00-\u9fa5A-Za-z0-9_]{0,40})\s*(>=|<=|>|<|==|!=|≥|≤|不小于|不大于)\s*([0-9]+(?:\.[0-9]+)?|[\u4e00-\u9fa5A-Za-z_][^，。;；]*)/;
  const match = rulePattern.exec(rowText);
  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }
  const operator = normalizeOperator(match[2]);
  if (!operator) {
    return null;
  }
  return {
    field: normalizeFieldName(match[1]),
    operator,
    value: parseNumericOrText(match[3]),
    message: rowText.trim(),
  };
}

export function tableToRules(block: ExtractedTableBlock): ExtractedRule[] {
  if (block.type !== "rule_table") {
    return [];
  }
  return block.rows
    .map((row) => parseRuleFromRow(row.join(" ")))
    .filter((item): item is ExtractedRule => Boolean(item));
}
