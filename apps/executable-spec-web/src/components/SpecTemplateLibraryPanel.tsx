import { useEffect, useMemo, useState } from "react";

import {
  createAndRegisterSpecFromTemplate,
  getPlatformApiBase,
  getSpecTemplates,
  registerMarkdownSpec,
  type RegisterMarkdownSpecResponse,
  type RegisterTemplateSpecResponse,
  type SpecMarkdownTemplate,
  type TemplateSpuRelation,
} from "../platform/api-client.ts";
import { getBuiltInTemplates } from "../spec-compiler/templates/builtins.ts";
import { renderMarkdownFromTemplate } from "../spec-compiler/templates/renderer.ts";

type SpecTemplateLibraryPanelProps = {
  onRegistered?: (response: Extract<RegisterMarkdownSpecResponse, { success: true }>) => Promise<void> | void;
};

function toInputValue(value: string | number | undefined): string {
  if (typeof value === "number") {
    return String(value);
  }
  return String(value ?? "");
}

export default function SpecTemplateLibraryPanel(props: SpecTemplateLibraryPanelProps) {
  const [templates, setTemplates] = useState<SpecMarkdownTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RegisterTemplateSpecResponse | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.templateId === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );

  function isNotFoundError(reason: unknown): boolean {
    const message = reason instanceof Error ? reason.message : String(reason);
    return /not found|404/i.test(message);
  }

  function applyTemplatesAndDefaults(items: SpecMarkdownTemplate[]): void {
    setTemplates(items);
    const first = items[0] ?? null;
    if (!first) {
      return;
    }
    setSelectedTemplateId(first.templateId);
    const defaults: Record<string, string> = {};
    for (const variable of first.variables) {
      defaults[variable.key] = toInputValue(variable.defaultValue);
    }
    setFormValues(defaults);
  }

  useEffect(() => {
    void (async () => {
      setLoadingTemplates(true);
      setError("");
      setNotice("");
      try {
        const response = await getSpecTemplates();
        applyTemplatesAndDefaults(response.items);
      } catch (reason) {
        if (isNotFoundError(reason)) {
          applyTemplatesAndDefaults(getBuiltInTemplates());
          setNotice(`模板接口不可用，已切换到本地模板模式（当前 API: ${getPlatformApiBase()}）`);
        } else {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      } finally {
        setLoadingTemplates(false);
      }
    })();
  }, []);

  function handleSelectTemplate(templateId: string): void {
    setSelectedTemplateId(templateId);
    setResult(null);
    const template = templates.find((item) => item.templateId === templateId) ?? null;
    if (!template) {
      return;
    }
    const defaults: Record<string, string> = {};
    for (const variable of template.variables) {
      defaults[variable.key] = toInputValue(variable.defaultValue);
    }
    setFormValues(defaults);
  }

  async function handleCreateAndRegister(): Promise<void> {
    if (!selectedTemplate) {
      setError("请先选择模板。");
      return;
    }
    setSubmitting(true);
    setResult(null);
    setError("");
    setNotice("");
    try {
      const payload: Record<string, string | number> = {};
      for (const variable of selectedTemplate.variables) {
        const raw = (formValues[variable.key] ?? "").trim();
        if (variable.type === "number") {
          payload[variable.key] = raw.length > 0 ? Number(raw) : Number.NaN;
        } else {
          payload[variable.key] = raw;
        }
      }
      try {
        const response = await createAndRegisterSpecFromTemplate(selectedTemplate.templateId, payload);
        setResult(response);
        if (response.registerResult.success) {
          await props.onRegistered?.(response.registerResult);
        }
      } catch (reason) {
        if (!isNotFoundError(reason)) {
          throw reason;
        }
        const markdown = renderMarkdownFromTemplate(selectedTemplate, payload);
        const registerResult = await registerMarkdownSpec(markdown, undefined, { source: "template" });
        const relation: TemplateSpuRelation = {
          templateId: selectedTemplate.templateId,
          baseType: selectedTemplate.baseType,
          inheritedFromSpuId: null,
          derivedSpuId: registerResult.success ? registerResult.spuId : null,
          overrides: {},
          createdAt: new Date().toISOString(),
          reusableFieldKeys: selectedTemplate.reusableFields.map((item) => item.key),
          rulePlaceholderKeys: selectedTemplate.rulePlaceholders.map((item) => item.key),
          defaultProofRequirements: [...selectedTemplate.defaultProofRequirements],
        };
        const fallbackResult: RegisterTemplateSpecResponse = {
          template: selectedTemplate,
          markdown,
          values: payload,
          relation,
          registerResult,
          compileArtifact: "compileArtifact" in registerResult ? registerResult.compileArtifact : null,
          lintResult: registerResult.lintResult,
          compileResult: registerResult.compileResult,
          spu: registerResult.spu,
          specbundle: registerResult.specbundle,
        };
        setResult(fallbackResult);
        setNotice(`模板注册接口不可用，已自动走本地渲染 + register-markdown（当前 API: ${getPlatformApiBase()}）`);
        if (registerResult.success) {
          await props.onRegistered?.(registerResult);
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSubmitting(false);
    }
  }

  const lint = result && "lint" in result.registerResult ? result.registerResult.lint : null;
  const compiledJSON = result?.registerResult && "json" in result.registerResult ? result.registerResult.json : null;

  return (
    <section className="rounded-xl bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold">规范模板库</h2>
      <p className="mt-1 text-sm text-slate-500">选模板 → 填参数 → 生成 Markdown → lint → compile → register</p>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <label className="text-sm lg:col-span-1">
          <span className="mb-1 block font-medium">模板选择</span>
          <select
            className="w-full rounded border border-slate-300 px-3 py-2"
            value={selectedTemplateId}
            onChange={(event) => handleSelectTemplate(event.target.value)}
            disabled={loadingTemplates || submitting}
          >
            {templates.map((item) => (
              <option key={item.templateId} value={item.templateId}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm lg:col-span-2">
          <p className="font-semibold text-slate-700">{selectedTemplate?.name ?? "-"}</p>
          <p className="mt-1 text-slate-600">{selectedTemplate?.description ?? "请选择模板"}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {(selectedTemplate?.variables ?? []).map((variable) => (
          <label key={variable.key} className="text-sm">
            <span className="mb-1 block font-medium">
              {variable.label}
              {variable.required ? " *" : ""}
            </span>
            {variable.type === "select" ? (
              <select
                className="w-full rounded border border-slate-300 px-3 py-2"
                value={formValues[variable.key] ?? ""}
                onChange={(event) => setFormValues((prev) => ({ ...prev, [variable.key]: event.target.value }))}
                disabled={submitting}
              >
                {(variable.options ?? []).map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            ) : (
              <input
                className="w-full rounded border border-slate-300 px-3 py-2"
                type={variable.type === "number" ? "number" : "text"}
                step={variable.type === "number" ? "any" : undefined}
                value={formValues[variable.key] ?? ""}
                onChange={(event) => setFormValues((prev) => ({ ...prev, [variable.key]: event.target.value }))}
                disabled={submitting}
              />
            )}
          </label>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-60"
          type="button"
          disabled={loadingTemplates || submitting || !selectedTemplate}
          onClick={() => void handleCreateAndRegister()}
        >
          {submitting ? "生成中..." : "生成并注册"}
        </button>
      </div>

      {error ? <p className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {notice ? <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p> : null}

      {result ? (
        <div className="mt-3 space-y-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
          <p><strong>注册阶段:</strong> {result.registerResult.stage}</p>
          <p><strong>lint:</strong> {lint?.valid ? "通过" : "失败"}</p>
          {result.registerResult.success ? <p><strong>spuId:</strong> {result.registerResult.spuId}</p> : null}
          {!result.registerResult.success && result.registerResult.stage === "register" ? (
            <p className="text-rose-700"><strong>注册结果:</strong> {result.registerResult.error}</p>
          ) : null}

          <details className="rounded border border-slate-200 bg-white p-2">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">生成的 Markdown 预览</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{result.markdown}</pre>
          </details>

          <div>
            <p className="font-semibold">Lint 错误</p>
            {lint?.errors.length ? (
              <ul className="mt-1 list-disc space-y-1 pl-5 text-rose-700">
                {lint.errors.map((item, index) => (
                  <li key={`${item.code}-${index}`}>
                    [{item.code}] {item.section}: {item.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-emerald-700">无错误</p>
            )}
          </div>

          <div>
            <p className="font-semibold">Lint 警告</p>
            {lint?.warnings.length ? (
              <ul className="mt-1 list-disc space-y-1 pl-5 text-amber-700">
                {lint.warnings.map((item, index) => (
                  <li key={`${item.code}-${index}`}>
                    [{item.code}] {item.section}: {item.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-slate-600">无警告</p>
            )}
          </div>

          <details className="rounded border border-slate-200 bg-white p-2">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">JSON 预览（折叠）</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">
              {JSON.stringify(compiledJSON, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
    </section>
  );
}
