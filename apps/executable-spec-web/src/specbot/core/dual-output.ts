import { createHash } from "node:crypto";

import yaml from "js-yaml";
import JSZip from "jszip";

import { SPULoader } from "../../spu-loader.ts";

import type { InputField, Rule, SPU } from "../../spu-types.ts";

export type SpecBotOutputFormat = "markdown" | "json";

export type SpecBotOutputConfig = {
  formats: SpecBotOutputFormat[];
  bundling: boolean;
};

export type SpecIntegrity = {
  algorithm: "sha256";
  hashScope: "json-without-integrity";
  markdownRef: string;
  jsonRef: string;
  markdownSha256: string;
  jsonPayloadSha256: string;
  bindingSha256: string;
};

export type DualOutputJSON = SPU & {
  specId: string;
  format: "SPU-v1";
  generatedBy: "SpecBot-v1.0";
  generatedAt: string;
  markdownRef: string;
  output: SpecBotOutputConfig;
  integrity: SpecIntegrity;
};

export type DualOutput = {
  markdown: string;
  json: DualOutputJSON;
  bundle: Uint8Array | Buffer;
};

type HashManifest = {
  md_hash: string;
  json_hash: string;
  bundle_hash: string;
  binding: {
    markdown: "spec.md";
    json: "spec.json";
  };
};

const README_TEXT = `SpecBundle v1.0

This bundle contains:
* spec.md
* spec.json
* specir.yaml
* README.txt
* hash_manifest.json

Purpose:
* Human-readable handoff
* Machine-executable rule payload
* Auditable integrity binding`;

const DEFAULT_OUTPUT_CONFIG: SpecBotOutputConfig = {
  formats: ["markdown", "json"],
  bundling: true,
};

const OPERATOR_LABEL: Record<Rule["operator"], string> = {
  ">=": ">=",
  "<=": "<=",
  ">": ">",
  "<": "<",
  "==": "=",
  "!=": "!=",
};

type JsonBase = Omit<DualOutputJSON, "integrity">;

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export class SpecBotDualOutput {
  private readonly outputConfig: SpecBotOutputConfig;

  constructor(outputConfig?: Partial<SpecBotOutputConfig>) {
    this.outputConfig = {
      formats: outputConfig?.formats?.length ? [...outputConfig.formats] : [...DEFAULT_OUTPUT_CONFIG.formats],
      bundling: outputConfig?.bundling ?? DEFAULT_OUTPUT_CONFIG.bundling,
    };
  }

  async generate(spu: SPU): Promise<DualOutput> {
    const jsonBase = this.toJSON(spu);
    const jsonPayloadSha256 = this.hashJsonPayload(jsonBase);
    const markdown = this.toMarkdown(spu, jsonBase, { jsonPayloadSha256 });

    const markdownSha256 = sha256(markdown);
    const integrity: SpecIntegrity = {
      algorithm: "sha256",
      hashScope: "json-without-integrity",
      markdownRef: jsonBase.markdownRef,
      jsonRef: this.getJSONFileName(spu.spuId),
      markdownSha256,
      jsonPayloadSha256,
      bindingSha256: sha256(`${markdownSha256}:${jsonPayloadSha256}`),
    };

    const json: DualOutputJSON = {
      ...jsonBase,
      integrity,
    };

    const bundle = this.outputConfig.bundling
      ? await this.createBundle(spu, markdown, json)
      : typeof Buffer !== "undefined"
        ? Buffer.alloc(0)
        : new Uint8Array();

    return { markdown, json, bundle };
  }

  toJSON(spu: SPU): JsonBase {
    const cloned = this.cloneSpu(spu);
    return {
      specId: spu.spuId,
      format: "SPU-v1",
      generatedBy: "SpecBot-v1.0",
      generatedAt: new Date().toISOString(),
      ...cloned,
      markdownRef: this.getMarkdownFileName(spu.spuId),
      output: {
        formats: [...this.outputConfig.formats],
        bundling: this.outputConfig.bundling,
      },
    };
  }

  toMarkdown(
    spu: SPU,
    json: JsonBase,
    options?: { jsonPayloadSha256?: string },
  ): string {
    const pathLines = spu.path.map((step, index) => `${index + 1}. ${step.step}: \`${step.formula}\``).join("\n");
    const ruleLines = spu.rules.map((rule) => `* ${this.renderRuleLine(spu, rule)}`).join("\n");
    const inputLines = spu.data.inputs.map((input) => `* ${this.renderInputLine(input)}`).join("\n");

    return [
      `# ${spu.meta.name}`,
      "",
      `> 标准来源：${spu.meta.norm} 第 ${spu.meta.clause} 条`,
      `> SPU版本：${spu.meta.version}`,
      "",
      "---",
      "",
      "## 一、适用范围",
      "",
      this.renderScope(spu),
      "",
      "---",
      "",
      "## 二、检测步骤",
      "",
      pathLines || "暂无自动计算步骤。",
      "",
      "---",
      "",
      "## 三、合格标准",
      "",
      ruleLines || "暂无判定规则。",
      "",
      "---",
      "",
      "## 四、输入参数",
      "",
      inputLines || "暂无输入参数。",
      "",
      "---",
      "",
      "## 五、系统对接",
      "",
      "```json",
      JSON.stringify(
        {
          jsonRef: this.getJSONFileName(spu.spuId),
          markdownRef: this.getMarkdownFileName(spu.spuId),
          specId: json.specId,
          format: json.format,
          generatedBy: json.generatedBy,
          jsonPayloadSha256: options?.jsonPayloadSha256 ?? "PENDING",
        },
        null,
        2,
      ),
      "```",
      "",
    ].join("\n");
  }

  async createBundle(spu: SPU, markdown: string, json: DualOutputJSON): Promise<Uint8Array | Buffer> {
    const zip = new JSZip();
    const specIrText = this.buildSpecIrYaml(spu);

    let jsonObject = JSON.parse(JSON.stringify(json)) as Record<string, unknown>;
    let jsonText = `${JSON.stringify(jsonObject, null, 2)}\n`;
    const mdHash = sha256(markdown);
    let jsonHash = sha256(jsonText);
    let bundleHash = sha256(`${mdHash}:${jsonHash}:${sha256(specIrText)}`);

    const manifest: HashManifest = {
      md_hash: mdHash,
      json_hash: jsonHash,
      bundle_hash: bundleHash,
      binding: {
        markdown: "spec.md",
        json: "spec.json",
      },
    };

    jsonObject = {
      ...jsonObject,
      spec_md_hash: mdHash,
      hash_manifest: manifest,
    };
    jsonText = `${JSON.stringify(jsonObject, null, 2)}\n`;
    jsonHash = sha256(jsonText);
    bundleHash = sha256(`${mdHash}:${jsonHash}:${sha256(specIrText)}`);

    const finalManifest: HashManifest = {
      ...manifest,
      json_hash: jsonHash,
      bundle_hash: bundleHash,
    };

    const readme = `${README_TEXT}

standard_code: ${spu.meta.norm}
version: ${spu.meta.version}
generated_at: ${new Date().toISOString()}
source_pdf: UNKNOWN
bundle_hash: ${bundleHash}
`;

    zip.file("spec.md", markdown);
    zip.file("spec.json", jsonText);
    zip.file("specir.yaml", specIrText);
    zip.file("README.txt", readme);
    zip.file("hash_manifest.json", `${JSON.stringify(finalManifest, null, 2)}\n`);

    if (typeof Buffer !== "undefined") {
      return zip.generateAsync({ type: "nodebuffer" });
    }
    return zip.generateAsync({ type: "uint8array" });
  }

  getMarkdownFileName(spuId: string): string {
    return `${spuId}.md`;
  }

  getJSONFileName(spuId: string): string {
    return `${spuId}.json`;
  }

  getBundleFileName(spuId: string): string {
    const spu = SPULoader.getSPU(spuId);
    const standardCode = String(spu?.meta.norm ?? spuId).trim().replace(/[^\w.-]+/g, "-");
    const version = String(spu?.meta.version ?? "v1").trim().replace(/[^\w.-]+/g, "-") || "v1";
    return `${standardCode}@${version}.specbundle`;
  }

  private buildSpecIrYaml(spu: SPU): string {
    const clauseId = String(spu.meta.clause ?? "").trim();
    const componentId = String(spu.spuId ?? "").trim();
    const metaRecord = spu.meta as Record<string, unknown>;
    const metaExtensions = (
      metaRecord.extensions && typeof metaRecord.extensions === "object" && !Array.isArray(metaRecord.extensions)
        ? metaRecord.extensions
        : {}
    ) as Record<string, unknown>;
    const clauseOriginalText = String(
      metaExtensions.clause_content
      ?? metaExtensions.original_text
      ?? "",
    ).trim();
    const derivedClauseText = spu.rules
      .map((rule) => String(rule.message ?? "").trim())
      .filter(Boolean)
      .join("；");
    const rules = spu.rules.map((rule, index) => ({
      rule_id: String(rule.ruleId ?? `RULE-${String(index + 1).padStart(3, "0")}`),
      component_id: componentId,
      clause_id: clauseId,
      input_schema: {
        fields: spu.data.inputs.map((item) => ({
          name: item.name,
          type: item.type,
          required: item.required !== false,
          unit: item.unit ?? null,
        })),
      },
      path_logic: {
        steps: spu.path,
      },
      gate_condition: {
        expression: `${rule.field} ${rule.operator} ${String(rule.value)}`,
        deterministic: true,
      },
      state_machine: {
        before: "RUNNING",
        pass: "PASS",
        fail: "FAIL",
      },
      proof_template: {
        resultField: spu.proof.resultField,
      },
    }));
    const specIr = {
      spec_id: spu.spuId,
      standard_code: spu.meta.norm,
      standard_name: spu.meta.name,
      version: spu.meta.version,
      source_pdf: {
        file_name: String(metaExtensions.source_pdf_file_name ?? "UNKNOWN.pdf"),
        file_hash: String(metaExtensions.source_pdf_hash ?? "unknown"),
        pages: Number(metaExtensions.source_pdf_pages ?? 1) || 1,
      },
      catalog: {
        category: String(metaRecord.category ?? "UNKNOWN"),
        work_item: String(metaRecord.workItem ?? "UNKNOWN"),
        measured_item: String(metaRecord.measuredItem ?? spu.meta.name),
        path: [
          String(metaRecord.category ?? "UNKNOWN"),
          String(metaRecord.workItem ?? "UNKNOWN"),
          String(metaRecord.measuredItem ?? spu.meta.name),
        ],
      },
      clauses: [{
        clause_id: clauseId,
        clause_no: clauseId,
        title: spu.meta.name,
        original_text: clauseOriginalText || derivedClauseText || `${spu.meta.name} 对应条款`,
        page: 1,
        parent_clause_id: null,
        level: 1,
      }],
      components: [{
        component_id: componentId,
        category: String(metaRecord.category ?? "").trim() || "UNKNOWN",
        work_item: String(metaRecord.workItem ?? "").trim() || "UNKNOWN",
        measured_item: String(metaRecord.measuredItem ?? spu.meta.name),
        test_method: "UNKNOWN",
        bound_clause_ids: clauseId ? [clauseId] : [],
      }],
      rules,
      metadata: {
        created_at: new Date().toISOString(),
        created_by: "SpecBot-v1.0",
        language: "zh-CN",
        compile_target: "spec.json",
        generated_by: "SpecBot-v1.0",
      },
    };
    return yaml.dump(specIr, { lineWidth: -1, noRefs: true, sortKeys: false });
  }

  private cloneSpu(spu: SPU): SPU {
    return JSON.parse(JSON.stringify(spu)) as SPU;
  }

  private hashJsonPayload(jsonBase: JsonBase): string {
    return sha256(
      this.stableStringify({
        ...jsonBase,
        generatedAt: "__NORMALIZED_GENERATED_AT__",
      }),
    );
  }

  private stableStringify(value: unknown): string {
    return JSON.stringify(this.sortValue(value));
  }

  private sortValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortValue(item));
    }
    if (value && typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
      const sorted: Record<string, unknown> = {};
      for (const [key, child] of entries) {
        sorted[key] = this.sortValue(child);
      }
      return sorted;
    }
    return value;
  }

  private renderScope(spu: SPU): string {
    const metaRecord = spu.meta as Record<string, unknown>;
    const category = typeof metaRecord.category === "string" ? metaRecord.category : "";
    const workItem = typeof metaRecord.workItem === "string" ? metaRecord.workItem : "";
    const measuredItem = typeof metaRecord.measuredItem === "string" ? metaRecord.measuredItem : spu.meta.name;

    const context = [category, workItem].filter((item) => item.trim().length > 0).join(" / ");
    if (context) {
      return `适用于 ${context} 场景下的“${measuredItem}”检测、自动计算与判定。`;
    }
    return `适用于 ${spu.meta.norm} 第 ${spu.meta.clause} 条对应的“${measuredItem}”检测场景。`;
  }

  private renderRuleLine(spu: SPU, rule: Rule): string {
    const fieldLabel = rule.field === spu.proof.resultField ? spu.meta.name : this.humanizeFieldName(rule.field);
    const operator = OPERATOR_LABEL[rule.operator] ?? rule.operator;
    const expectedValue = this.renderRuleValue(rule.value);
    if (rule.message && rule.message.trim().length > 0) {
      return `${rule.message}（${fieldLabel} ${operator} ${expectedValue}）`;
    }
    return `${fieldLabel} 必须 ${operator} ${expectedValue}`;
  }

  private renderRuleValue(value: Rule["value"]): string {
    if (typeof value === "string" && value.startsWith("**INPUT**:")) {
      return `输入参数 ${value.slice("**INPUT**:".length)}`;
    }
    return String(value);
  }

  private renderInputLine(input: InputField): string {
    return `${input.label}（${this.renderInputType(input.type)}，字段名：\`${input.name}\`）`;
  }

  private renderInputType(type: InputField["type"]): string {
    switch (type) {
      case "number":
        return "数值";
      case "string":
        return "文本";
      case "boolean":
        return "布尔";
      default:
        return type;
    }
  }

  private humanizeFieldName(field: string): string {
    return field
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .trim();
  }
}

export async function exportLoadedSpuSpec(spuId: string): Promise<DualOutput> {
  const spu = SPULoader.getSPU(spuId);
  if (!spu) {
    throw new Error(`SPU not loaded: ${spuId}`);
  }
  return new SpecBotDualOutput().generate(spu);
}
