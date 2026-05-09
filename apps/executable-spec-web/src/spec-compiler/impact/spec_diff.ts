export type SpecDiffChangeType = "added" | "removed" | "modified";

export interface SpecDiffItem {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  changeType: SpecDiffChangeType;
}

interface ComparableInputField {
  name: string;
  type: string;
  unit: string;
  label: string;
}

interface ComparableRuleField {
  field: string;
  operator: string;
  value: string | number | boolean;
  message: string;
}

interface ComparablePathStep {
  step: string;
  formula: string;
}

export interface ComparableSpecJson {
  spuId: string;
  meta: {
    norm: string;
    clause: string;
    version: string;
    name: string;
    category: string;
    measuredItem: string;
  };
  data: {
    inputs: ComparableInputField[];
    outputs: string[];
  };
  path: ComparablePathStep[];
  rules: ComparableRuleField[];
  proof: {
    requiredSignatures: string[];
  };
  dependsOn: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item));
}

function normalizeOutputs(rawOutputs: unknown): string[] {
  if (!Array.isArray(rawOutputs)) {
    return [];
  }
  return rawOutputs
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      const obj = asRecord(item);
      return asString(obj.name) || asString(obj.label);
    })
    .filter((item) => item.length > 0);
}

function normalizeInputs(rawInputs: unknown): ComparableInputField[] {
  if (!Array.isArray(rawInputs)) {
    return [];
  }
  return rawInputs.map((item) => {
    const obj = asRecord(item);
    return {
      name: asString(obj.name),
      type: asString(obj.type),
      unit: asString(obj.unit),
      label: asString(obj.label),
    };
  });
}

function normalizeRules(rawRules: unknown): ComparableRuleField[] {
  if (!Array.isArray(rawRules)) {
    return [];
  }
  return rawRules.map((item) => {
    const obj = asRecord(item);
    const rawValue = obj.value;
    const normalizedValue =
      typeof rawValue === "number" || typeof rawValue === "boolean" || typeof rawValue === "string" ? rawValue : asString(rawValue);
    return {
      field: asString(obj.field),
      operator: asString(obj.operator),
      value: normalizedValue,
      message: asString(obj.message),
    };
  });
}

function normalizePath(rawPath: unknown): ComparablePathStep[] {
  if (!Array.isArray(rawPath)) {
    return [];
  }
  return rawPath.map((item) => {
    const obj = asRecord(item);
    return {
      step: asString(obj.step),
      formula: asString(obj.formula),
    };
  });
}

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableNormalize(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const normalized: Record<string, unknown> = {};
  for (const key of keys) {
    normalized[key] = stableNormalize(record[key]);
  }
  return normalized;
}

function isEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableNormalize(left)) === JSON.stringify(stableNormalize(right));
}

function pushLeafDiff(diffs: SpecDiffItem[], field: string, oldValue: unknown, newValue: unknown): void {
  if (isEqual(oldValue, newValue)) {
    return;
  }
  const changeType: SpecDiffChangeType =
    typeof oldValue === "undefined" ? "added" : typeof newValue === "undefined" ? "removed" : "modified";
  diffs.push({
    field,
    oldValue,
    newValue,
    changeType,
  });
}

function diffDeep(diffs: SpecDiffItem[], field: string, oldValue: unknown, newValue: unknown): void {
  if (isEqual(oldValue, newValue)) {
    return;
  }

  const oldArray = Array.isArray(oldValue);
  const newArray = Array.isArray(newValue);
  if (oldArray || newArray) {
    if (!oldArray || !newArray) {
      pushLeafDiff(diffs, field, oldValue, newValue);
      return;
    }
    const maxLength = Math.max(oldValue.length, newValue.length);
    for (let index = 0; index < maxLength; index += 1) {
      diffDeep(diffs, `${field}[${index}]`, oldValue[index], newValue[index]);
    }
    return;
  }

  const oldIsObject = Boolean(oldValue) && typeof oldValue === "object";
  const newIsObject = Boolean(newValue) && typeof newValue === "object";
  if (oldIsObject || newIsObject) {
    if (!oldIsObject || !newIsObject) {
      pushLeafDiff(diffs, field, oldValue, newValue);
      return;
    }
    const oldRecord = oldValue as Record<string, unknown>;
    const newRecord = newValue as Record<string, unknown>;
    const keys = Array.from(new Set([...Object.keys(oldRecord), ...Object.keys(newRecord)])).sort();
    for (const key of keys) {
      const nextField = field ? `${field}.${key}` : key;
      diffDeep(diffs, nextField, oldRecord[key], newRecord[key]);
    }
    return;
  }

  pushLeafDiff(diffs, field, oldValue, newValue);
}

export function normalizeSpecForImpact(spec: unknown): ComparableSpecJson {
  const root = asRecord(spec);
  const meta = asRecord(root.meta);
  const data = asRecord(root.data);
  const proof = asRecord(root.proof);

  return {
    spuId: asString(root.spuId),
    meta: {
      norm: asString(meta.norm),
      clause: asString(meta.clause),
      version: asString(meta.version),
      name: asString(meta.name),
      category: asString(meta.category),
      measuredItem: asString(meta.measuredItem),
    },
    data: {
      inputs: normalizeInputs(data.inputs),
      outputs: normalizeOutputs(data.outputs),
    },
    path: normalizePath(root.path),
    rules: normalizeRules(root.rules),
    proof: {
      requiredSignatures: asStringArray(proof.requiredSignatures),
    },
    dependsOn: asStringArray(root.dependsOn),
  };
}

export function diffSpecJson(oldSpec: unknown, newSpec: unknown): SpecDiffItem[] {
  const oldSnapshot = normalizeSpecForImpact(oldSpec);
  const newSnapshot = normalizeSpecForImpact(newSpec);
  const diffs: SpecDiffItem[] = [];

  const fieldPairs: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [
    { field: "meta.norm", oldValue: oldSnapshot.meta.norm, newValue: newSnapshot.meta.norm },
    { field: "meta.clause", oldValue: oldSnapshot.meta.clause, newValue: newSnapshot.meta.clause },
    { field: "meta.version", oldValue: oldSnapshot.meta.version, newValue: newSnapshot.meta.version },
    { field: "meta.name", oldValue: oldSnapshot.meta.name, newValue: newSnapshot.meta.name },
    { field: "meta.category", oldValue: oldSnapshot.meta.category, newValue: newSnapshot.meta.category },
    { field: "data.inputs", oldValue: oldSnapshot.data.inputs, newValue: newSnapshot.data.inputs },
    { field: "data.outputs", oldValue: oldSnapshot.data.outputs, newValue: newSnapshot.data.outputs },
    { field: "path", oldValue: oldSnapshot.path, newValue: newSnapshot.path },
    { field: "rules", oldValue: oldSnapshot.rules, newValue: newSnapshot.rules },
    {
      field: "proof.requiredSignatures",
      oldValue: oldSnapshot.proof.requiredSignatures,
      newValue: newSnapshot.proof.requiredSignatures,
    },
    { field: "dependsOn", oldValue: oldSnapshot.dependsOn, newValue: newSnapshot.dependsOn },
  ];

  for (const pair of fieldPairs) {
    diffDeep(diffs, pair.field, pair.oldValue, pair.newValue);
  }
  return diffs;
}
