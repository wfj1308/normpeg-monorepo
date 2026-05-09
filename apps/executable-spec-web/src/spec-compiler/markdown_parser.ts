import type {
  ParsedMarkdownInput,
  ParsedMarkdownMeta,
  ParsedMarkdownRule,
  ParsedMarkdownSpec,
  SupportedFieldType,
  SupportedRuleOperator,
} from "./schemas.ts";

type SectionKey =
  | "inputs"
  | "outputs"
  | "calculations"
  | "rules"
  | "signatures"
  | "dependsOn";

const SECTION_TITLE_MAP: Record<string, SectionKey> = {
  输入参数: "inputs",
  输出参数: "outputs",
  计算步骤: "calculations",
  判定规则: "rules",
  签字要求: "signatures",
  依赖: "dependsOn",
};

const META_KEY_MAP: Record<string, keyof ParsedMarkdownMeta> = {
  规范来源: "norm",
  条款号: "clause",
  版本: "version",
  分类: "category",
  检测项: "measuredItem",
};

const SUPPORTED_FIELD_TYPES = new Set<SupportedFieldType>(["number", "string", "boolean"]);
const SUPPORTED_RULE_OPERATORS = new Set<SupportedRuleOperator>([">=", "<=", ">", "<", "==", "!="]);

function normalizeLineBreaks(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function stripBulletPrefix(line: string): string | null {
  const bulletMatch = /^\s*-\s+(.+?)\s*$/.exec(line);
  if (!bulletMatch) {
    return null;
  }
  return bulletMatch[1].trim();
}

function stripNumberPrefix(line: string): string | null {
  const numberedMatch = /^\s*\d+\.\s+(.+?)\s*$/.exec(line);
  if (!numberedMatch) {
    return null;
  }
  return numberedMatch[1].trim();
}

function normalizeHeading(text: string): string {
  return text.replace(/\s+/g, "");
}

function splitOnce(input: string, separator: string): [string, string] | null {
  const index = input.indexOf(separator);
  if (index < 0) {
    return null;
  }
  return [input.slice(0, index), input.slice(index + separator.length)];
}

function parseMeta(metaLines: string[]): ParsedMarkdownMeta {
  const parsed: Partial<ParsedMarkdownMeta> = {};

  for (const rawLine of metaLines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const matched = /^([^:：]+)\s*[:：]\s*(.+)$/.exec(line);
    if (!matched) {
      continue;
    }
    const key = matched[1]?.trim();
    const value = matched[2]?.trim() ?? "";
    if (!key || !value) {
      continue;
    }
    const mappedKey = META_KEY_MAP[key];
    if (!mappedKey) {
      continue;
    }
    parsed[mappedKey] = value;
  }

  if (!parsed.norm) {
    throw new Error("Markdown 模板缺少“规范来源”");
  }
  if (!parsed.clause) {
    throw new Error("Markdown 模板缺少“条款号”");
  }
  if (!parsed.version) {
    throw new Error("Markdown 模板缺少“版本”");
  }

  return {
    norm: parsed.norm,
    clause: parsed.clause,
    version: parsed.version,
    category: parsed.category,
    measuredItem: parsed.measuredItem,
  };
}

function parseInputs(lines: string[]): ParsedMarkdownInput[] {
  const parsed = lines
    .map((line) => stripBulletPrefix(line))
    .filter((line): line is string => Boolean(line))
    .map((line) => {
      const fields = line.split("|").map((item) => item.trim());
      if (fields.length !== 4) {
        throw new Error(`输入参数格式错误，应为 name | type | unit | label：${line}`);
      }
      const [name, typeRaw, unit, label] = fields;
      const type = typeRaw.toLowerCase() as SupportedFieldType;
      if (!name || !unit || !label) {
        throw new Error(`输入参数字段不能为空：${line}`);
      }
      if (!SUPPORTED_FIELD_TYPES.has(type)) {
        throw new Error(`不支持的输入参数类型：${typeRaw}`);
      }
      return {
        name,
        type,
        unit,
        label,
      };
    });

  if (parsed.length === 0) {
    throw new Error("Markdown 模板缺少“输入参数”列表");
  }

  return parsed;
}

function parseOutputs(lines: string[]): string[] {
  const parsed = lines
    .map((line) => stripBulletPrefix(line))
    .filter((line): line is string => Boolean(line))
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (parsed.length === 0) {
    throw new Error("Markdown 模板缺少“输出参数”列表");
  }
  return parsed;
}

function parseCalculations(lines: string[]): string[] {
  const parsed: string[] = [];
  for (const line of lines) {
    const formula = stripNumberPrefix(line) ?? stripBulletPrefix(line);
    if (!formula) {
      continue;
    }
    if (!formula.includes("=")) {
      throw new Error(`计算步骤必须包含 "="：${formula}`);
    }
    parsed.push(formula);
  }

  if (parsed.length === 0) {
    throw new Error("Markdown 模板缺少“计算步骤”列表");
  }

  return parsed;
}

function parseRuleValue(raw: string): number | string {
  const normalized = raw.trim();
  const maybeNumber = Number(normalized);
  if (!Number.isNaN(maybeNumber) && normalized.length > 0) {
    return maybeNumber;
  }
  return normalized.replace(/^["']|["']$/g, "");
}

function parseRules(lines: string[]): ParsedMarkdownRule[] {
  const parsed: ParsedMarkdownRule[] = [];
  for (const rawLine of lines) {
    const ruleLine = stripBulletPrefix(rawLine);
    if (!ruleLine) {
      continue;
    }

    const conditionAndMessage = splitOnce(ruleLine, "|");
    if (!conditionAndMessage) {
      throw new Error(`判定规则格式错误，应为 condition | message：${ruleLine}`);
    }
    const [conditionRaw, messageRaw] = conditionAndMessage;
    const condition = conditionRaw.trim();
    const message = messageRaw.trim();
    if (!message) {
      throw new Error(`判定规则缺少 message：${ruleLine}`);
    }

    const matched = /^([A-Za-z_][A-Za-z0-9_.]*)\s*(>=|<=|==|!=|>|<)\s*(.+)$/.exec(condition);
    if (!matched) {
      throw new Error(`判定规则条件格式错误：${condition}`);
    }

    const field = matched[1]?.trim() ?? "";
    const operator = (matched[2]?.trim() ?? "") as SupportedRuleOperator;
    const valueRaw = matched[3]?.trim() ?? "";
    if (!field || !valueRaw) {
      throw new Error(`判定规则条件字段不能为空：${condition}`);
    }
    if (!SUPPORTED_RULE_OPERATORS.has(operator)) {
      throw new Error(`不支持的判定操作符：${operator}`);
    }

    parsed.push({
      field,
      operator,
      value: parseRuleValue(valueRaw),
      message,
    });
  }

  if (parsed.length === 0) {
    throw new Error("Markdown 模板缺少“判定规则”列表");
  }

  return parsed;
}

function parseSignatures(lines: string[]): string[] {
  const parsed = lines
    .map((line) => stripBulletPrefix(line))
    .filter((line): line is string => Boolean(line))
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (parsed.length === 0) {
    throw new Error("Markdown 模板缺少“签字要求”列表");
  }

  return parsed;
}

function parseDependsOn(lines: string[]): string[] {
  const parsed = lines
    .map((line) => stripBulletPrefix(line))
    .filter((line): line is string => Boolean(line))
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (parsed.length === 0) {
    throw new Error("Markdown 模板缺少“依赖”列表");
  }

  const hasNone = parsed.some((line) => line.toLowerCase() === "none");
  if (hasNone && parsed.length > 1) {
    throw new Error("依赖列表若包含 none，不可再包含其他 spuId");
  }
  if (hasNone) {
    return [];
  }
  return parsed;
}

export function parseMarkdownSpec(markdown: string): ParsedMarkdownSpec {
  const content = normalizeLineBreaks(markdown ?? "");
  const lines = content.split("\n");

  let title = "";
  let cursor = 0;
  while (cursor < lines.length) {
    const line = lines[cursor]?.trim() ?? "";
    if (!line) {
      cursor += 1;
      continue;
    }
    const titleMatch = /^#\s+(.+)$/.exec(line);
    if (!titleMatch || !titleMatch[1]?.trim()) {
      throw new Error("Markdown 模板第一行必须是一级标题，例如：# 路基压实度（土质）");
    }
    title = titleMatch[1].trim();
    cursor += 1;
    break;
  }

  if (!title) {
    throw new Error("Markdown 模板缺少标题");
  }

  const metaLines: string[] = [];
  const sectionLines: Record<SectionKey, string[]> = {
    inputs: [],
    outputs: [],
    calculations: [],
    rules: [],
    signatures: [],
    dependsOn: [],
  };

  let currentSection: SectionKey | null = null;
  for (; cursor < lines.length; cursor += 1) {
    const rawLine = lines[cursor] ?? "";
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    const sectionMatch = /^##\s+(.+)$/.exec(trimmed);
    if (sectionMatch) {
      const heading = normalizeHeading(sectionMatch[1] ?? "");
      const mapped = SECTION_TITLE_MAP[heading];
      if (!mapped) {
        throw new Error(`不支持的章节标题：${sectionMatch[1]?.trim() ?? ""}`);
      }
      currentSection = mapped;
      continue;
    }

    if (!trimmed) {
      continue;
    }

    if (!currentSection) {
      metaLines.push(trimmed);
      continue;
    }

    sectionLines[currentSection].push(trimmed);
  }

  const meta = parseMeta(metaLines);
  const inputs = parseInputs(sectionLines.inputs);
  const outputs = parseOutputs(sectionLines.outputs);
  const calculations = parseCalculations(sectionLines.calculations);
  const rules = parseRules(sectionLines.rules);
  const signatures = parseSignatures(sectionLines.signatures);
  const dependsOn = parseDependsOn(sectionLines.dependsOn);

  return {
    title,
    meta,
    inputs,
    outputs,
    calculations,
    rules,
    signatures,
    dependsOn,
  };
}
