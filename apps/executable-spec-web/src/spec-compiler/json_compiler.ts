import { parseMarkdownSpec } from "./markdown_parser.ts";
import { buildSpuId } from "./spu_id_builder.ts";

import type { CompileMarkdownOptions, CompiledMarkdownSpecJSON, ParsedMarkdownSpec } from "./schemas.ts";

function resolveResultField(parsed: ParsedMarkdownSpec): string {
  if (parsed.rules.length > 0) {
    return parsed.rules[0].field;
  }
  if (parsed.outputs.length > 0) {
    return parsed.outputs[parsed.outputs.length - 1] ?? "";
  }
  throw new Error("无法推断 proof.resultField：缺少 rules 和 outputs");
}

export function compileMarkdownToJSON(
  parsed: ParsedMarkdownSpec,
  options?: CompileMarkdownOptions,
): CompiledMarkdownSpecJSON {
  const category = parsed.meta.category ?? "general";
  const measuredItem = parsed.meta.measuredItem ?? "metric";
  const spuId = buildSpuId(
    {
      category,
      measuredItem,
      clause: parsed.meta.clause,
      version: parsed.meta.version,
    },
    parsed.title,
    options,
  );

  return {
    spuId,
    meta: {
      name: parsed.title,
      norm: parsed.meta.norm,
      clause: parsed.meta.clause,
      version: parsed.meta.version,
      category,
      measuredItem,
    },
    data: {
      inputs: parsed.inputs.map((item) => ({
        name: item.name,
        type: item.type,
        unit: item.unit,
        label: item.label,
      })),
      outputs: [...parsed.outputs],
    },
    path: parsed.calculations.map((formula, index) => ({
      step: `step_${index + 1}`,
      formula,
    })),
    rules: parsed.rules.map((rule) => ({
      field: rule.field,
      operator: rule.operator,
      value: rule.value,
      message: rule.message,
    })),
    proof: {
      resultField: resolveResultField(parsed),
      requiredSignatures: [...parsed.signatures],
    },
    dependsOn: [...parsed.dependsOn],
  };
}

export function compileMarkdownSpec(markdown: string, options?: CompileMarkdownOptions): CompiledMarkdownSpecJSON {
  return compileMarkdownToJSON(parseMarkdownSpec(markdown), options);
}
