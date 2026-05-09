import { useMemo, useState } from "react";

import { registerMarkdownSpec, type RegisterMarkdownSpecResponse } from "../platform/api-client.ts";

const DEFAULT_MARKDOWN_TEMPLATE = `# 路基压实度（土质）

规范来源：JTG F80/1-2017
条款号：4.2.1
版本：v1
分类：subgrade
检测项：compaction

## 输入参数
- massHoleSand | number | g | 灌入砂质量
- volumeSand | number | cm3 | 标定体积
- moistureContent | number | % | 含水率
- maxDryDensity | number | g/cm3 | 最大干密度

## 输出参数
- wetDensity
- dryDensity
- compactionDegree

## 计算步骤
1. wetDensity = massHoleSand / volumeSand
2. dryDensity = wetDensity / (1 + moistureContent / 100)
3. compactionDegree = (dryDensity / maxDryDensity) * 100

## 判定规则
- compactionDegree >= 93 | 压实度必须 ≥ 93%

## 签字要求
- lab
- supervision

## 依赖
- none
`;

type MarkdownSpecImportPanelProps = {
  onRegistered?: (response: Extract<RegisterMarkdownSpecResponse, { success: true }>) => Promise<void> | void;
};

export default function MarkdownSpecImportPanel(props: MarkdownSpecImportPanelProps) {
  const [markdown, setMarkdown] = useState<string>(DEFAULT_MARKDOWN_TEMPLATE);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RegisterMarkdownSpecResponse | null>(null);
  const [requestError, setRequestError] = useState("");

  const lint = result && "lint" in result ? result.lint : null;
  const compiledJsonPreview = useMemo(() => {
    if (!result || !("json" in result)) {
      return null;
    }
    return result.json;
  }, [result]);

  async function handleRegisterMarkdown(): Promise<void> {
    setLoading(true);
    setRequestError("");
    setResult(null);
    try {
      const response = await registerMarkdownSpec(markdown, undefined, { source: "markdown" });
      setResult(response);
      if (response.success) {
        await props.onRegistered?.(response);
      }
    } catch (reason) {
      setRequestError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold">Markdown Spec 导入</h2>
      <p className="mt-1 text-sm text-slate-500">Markdown → lint → compile → register（最小链路）</p>

      <label className="mt-3 block text-sm">
        <span className="mb-1 block font-medium">Markdown 规范文本</span>
        <textarea
          className="h-64 w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs"
          value={markdown}
          onChange={(event) => setMarkdown(event.target.value)}
          placeholder="# 在此粘贴规范 Markdown"
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-60"
          type="button"
          disabled={loading || !markdown.trim()}
          onClick={() => void handleRegisterMarkdown()}
        >
          {loading ? "校验中..." : "校验并注册"}
        </button>
      </div>

      {requestError ? <p className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{requestError}</p> : null}

      {result ? (
        <div className="mt-3 space-y-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
          <div>
            <p><strong>阶段:</strong> {result.stage}</p>
            <p><strong>lint:</strong> {lint?.valid ? "通过" : "失败"}</p>
            {result.success ? <p><strong>spuId:</strong> {result.spuId}</p> : null}
            {!result.success && result.stage === "register" ? (
              <p className="text-rose-700"><strong>注册结果:</strong> {result.error}</p>
            ) : null}
          </div>

          <div>
            <p className="font-semibold">Lint 错误</p>
            {lint?.errors.length ? (
              <ul className="mt-1 list-disc space-y-1 pl-5 text-rose-700">
                {lint.errors.map((item, index) => (
                  <li key={`${item.code}-${index}`}>
                    [{item.code}] {item.section}: {item.message}
                    {typeof item.line === "number" ? ` (line ${item.line})` : ""}
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
                    {typeof item.line === "number" ? ` (line ${item.line})` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-slate-600">无警告</p>
            )}
          </div>

          <details className="rounded border border-slate-200 bg-white p-2">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">编译 JSON 预览</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">
              {JSON.stringify(compiledJsonPreview, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
    </section>
  );
}
