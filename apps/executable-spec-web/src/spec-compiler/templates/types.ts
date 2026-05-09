export interface TemplateVariable {
  key: string;
  label: string;
  type: "string" | "number" | "select";
  required: boolean;
  defaultValue?: string | number;
  options?: string[];
}

export interface TemplateReusableField {
  key: string;
  target: "meta" | "input" | "rule" | "proof" | "dependency";
  description?: string;
}

export interface TemplateRulePlaceholder {
  key: string;
  field: string;
  operator: ">=" | "<=" | ">" | "<" | "==" | "!=";
  description?: string;
  placeholderType?: "threshold" | "message" | "clause";
}

export interface SpecMarkdownTemplate {
  templateId: string;
  baseType: string;
  name: string;
  category: string;
  description?: string;
  reusableFields: TemplateReusableField[];
  rulePlaceholders: TemplateRulePlaceholder[];
  defaultProofRequirements: string[];
  variables: TemplateVariable[];
  markdownTemplate: string;
}

export type TemplateValue = string | number;
export type TemplateValues = Record<string, TemplateValue>;

export interface TemplateDerivationOverrides {
  clause?: string;
  threshold?: number;
  description?: string;
}

export interface TemplateDerivationOptions {
  inheritFromSpuId?: string | null;
  overrides?: TemplateDerivationOverrides;
}

export interface TemplateSpuRelation {
  templateId: string;
  baseType: string;
  inheritedFromSpuId: string | null;
  derivedSpuId: string | null;
  overrides: TemplateDerivationOverrides;
  createdAt: string;
  reusableFieldKeys: string[];
  rulePlaceholderKeys: string[];
  defaultProofRequirements: string[];
}
