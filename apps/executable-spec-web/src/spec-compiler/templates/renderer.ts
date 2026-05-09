import type { SpecMarkdownTemplate, TemplateValue, TemplateValues } from "./types.ts";

function normalizeValue(value: TemplateValue): string {
  return typeof value === "number" ? String(value) : String(value ?? "").trim();
}

function mergeValuesWithDefaults(template: SpecMarkdownTemplate, values: TemplateValues): TemplateValues {
  const merged: TemplateValues = {};
  for (const variable of template.variables) {
    const provided = values[variable.key];
    if (typeof provided !== "undefined") {
      merged[variable.key] = provided;
      continue;
    }
    if (typeof variable.defaultValue !== "undefined") {
      merged[variable.key] = variable.defaultValue;
    }
  }
  return merged;
}

function validateVariableValues(template: SpecMarkdownTemplate, values: TemplateValues): void {
  for (const variable of template.variables) {
    const raw = values[variable.key];
    const isMissing = typeof raw === "undefined" || normalizeValue(raw).length === 0;
    if (variable.required && isMissing) {
      throw new Error(`模板变量缺失: ${variable.key}（${variable.label}）`);
    }
    if (typeof raw === "undefined") {
      continue;
    }
    if (variable.type === "number") {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        throw new Error(`模板变量必须为数字: ${variable.key}`);
      }
    }
    if (variable.type === "select" && variable.options && variable.options.length > 0) {
      const normalized = normalizeValue(raw);
      if (!variable.options.includes(normalized)) {
        throw new Error(`模板变量取值不在可选项中: ${variable.key}`);
      }
    }
  }
}

export function renderMarkdownFromTemplate(
  template: SpecMarkdownTemplate,
  values: Record<string, string | number>,
): string {
  const mergedValues = mergeValuesWithDefaults(template, values);
  validateVariableValues(template, mergedValues);

  const usedKeys = new Set<string>();
  const rendered = template.markdownTemplate.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, rawKey: string) => {
    const key = String(rawKey || "").trim();
    usedKeys.add(key);
    const value = mergedValues[key];
    if (typeof value === "undefined") {
      throw new Error(`模板变量未提供: ${key}`);
    }
    return normalizeValue(value);
  });

  for (const key of usedKeys) {
    if (rendered.includes(`{{${key}}}`)) {
      throw new Error(`模板渲染失败，仍存在未替换占位符: ${key}`);
    }
  }

  return rendered.trim() + "\n";
}
