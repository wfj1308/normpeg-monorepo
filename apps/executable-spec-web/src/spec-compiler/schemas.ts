export type SupportedFieldType = "number" | "string" | "boolean";
export type SupportedRuleOperator = ">=" | "<=" | ">" | "<" | "==" | "!=";

export interface ParsedMarkdownMeta {
  norm: string;
  clause: string;
  version: string;
  category?: string;
  measuredItem?: string;
}

export interface ParsedMarkdownInput {
  name: string;
  type: SupportedFieldType;
  unit: string;
  label: string;
}

export interface ParsedMarkdownRule {
  field: string;
  operator: SupportedRuleOperator;
  value: number | string;
  message: string;
}

export interface ParsedMarkdownSpec {
  title: string;
  meta: ParsedMarkdownMeta;
  inputs: ParsedMarkdownInput[];
  outputs: string[];
  calculations: string[];
  rules: ParsedMarkdownRule[];
  signatures: string[];
  dependsOn: string[];
}

export interface CompiledMarkdownSpecJSON {
  spuId: string;
  meta: {
    name: string;
    norm: string;
    clause: string;
    version: string;
    category: string;
    measuredItem: string;
  };
  data: {
    inputs: Array<{
      name: string;
      type: SupportedFieldType;
      unit: string;
      label: string;
    }>;
    outputs: string[];
  };
  path: Array<{
    step: string;
    formula: string;
  }>;
  rules: Array<{
    field: string;
    operator: SupportedRuleOperator;
    value: number | string;
    message: string;
  }>;
  proof: {
    resultField: string;
    requiredSignatures: string[];
    extensions?: Record<string, unknown>;
  };
  dependsOn: string[];
}

export interface BuildSpuIdMeta {
  category?: string;
  measuredItem?: string;
  clause: string;
  version: string;
}

export interface BuildSpuIdOptions {
  domain?: string;
  subType?: string | null;
}

export interface CompileMarkdownOptions extends BuildSpuIdOptions {}
