import { useMemo, useState } from "react";

import {
  pdfToDraftMarkdown,
  registerMarkdownSpec,
  type PDFToDraftResponse,
  type RegisterMarkdownSpecResponse,
} from "../platform/api-client.ts";
import {
  buildClauseReviewItems,
  buildPreRegisterReview,
  createDefaultClauseReviewItems,
  type ClauseReviewItem,
} from "../spec-compiler/review/index.ts";
import DraftDiffReviewPanel from "./DraftDiffReviewPanel.tsx";
import PreRegisterReviewGatePanel from "./PreRegisterReviewGatePanel.tsx";
import RunningImpactScanPanel from "./RunningImpactScanPanel.tsx";
import SpuActivationPolicyPanel from "./SpuActivationPolicyPanel.tsx";
import SpecImpactAnalysisPanel from "./SpecImpactAnalysisPanel.tsx";
import WarningRiskReviewPanel from "./WarningRiskReviewPanel.tsx";

type PDFToMarkdownDraftPanelProps = {
  onRegistered?: (response: Extract<RegisterMarkdownSpecResponse, { success: true }>) => Promise<void> | void;
};

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取 PDF 失败"));
    reader.onload = () => {
      const value = String(reader.result ?? "");
      const base64 = value.includes(",") ? value.split(",")[1] ?? "" : value;
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });
}

function clauseBadgeClass(level: "high" | "medium" | "low"): string {
  if (level === "high") {
    return "border-rose-300 bg-rose-50 text-rose-700";
  }
  if (level === "medium") {
    return "border-amber-300 bg-amber-50 text-amber-800";
  }
  return "border-emerald-300 bg-emerald-50 text-emerald-800";
}

export default function PDFToMarkdownDraftPanel(props: PDFToMarkdownDraftPanelProps) {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [standardCode, setStandardCode] = useState("JTG F80/1-2017");
  const [defaultCategory, setDefaultCategory] = useState("subgrade");
  const [defaultVersion, setDefaultVersion] = useState("v1");
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [loadingRegister, setLoadingRegister] = useState(false);
  const [draftResult, setDraftResult] = useState<PDFToDraftResponse | null>(null);
  const [draftMarkdown, setDraftMarkdown] = useState("");
  const [originalDraftMarkdown, setOriginalDraftMarkdown] = useState("");
  const [clauseReviewItems, setClauseReviewItems] = useState<ClauseReviewItem[]>(createDefaultClauseReviewItems());
  const [registerRiskNotice, setRegisterRiskNotice] = useState("");
  const [registerResult, setRegisterResult] = useState<RegisterMarkdownSpecResponse | null>(null);
  const [error, setError] = useState("");

  const preRegisterReview = useMemo(() => {
    if (!draftResult) {
      return null;
    }
    const baseOriginal = originalDraftMarkdown || draftResult.draftMarkdown;
    const edited = draftMarkdown || draftResult.draftMarkdown;
    return buildPreRegisterReview({
      warnings: draftResult.warnings,
      originalDraftMarkdown: baseOriginal,
      editedMarkdown: edited,
      clauseReviewItems,
    });
  }, [draftResult, originalDraftMarkdown, draftMarkdown, clauseReviewItems]);

  const warningRiskReview = preRegisterReview?.riskReview ?? null;
  const diffReview = preRegisterReview?.diffReview ?? null;
  const clauseReview = preRegisterReview?.clauseReview ?? null;

  function toggleClauseConfirmed(id: string, confirmed: boolean): void {
    setClauseReviewItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) {
          return item;
        }
        return { ...item, confirmed };
      }),
    );
  }

  async function handleGenerateDraft(): Promise<void> {
    if (!pdfFile) {
      setError("请先选择 PDF 文件。");
      return;
    }
    setLoadingDraft(true);
    setError("");
    setRegisterRiskNotice("");
    setRegisterResult(null);
    try {
      const pdfBase64 = await readFileAsBase64(pdfFile);
      const result = await pdfToDraftMarkdown({
        pdfBase64,
        fileName: pdfFile.name,
        options: {
          standardCode: standardCode.trim() || undefined,
          defaultCategory: defaultCategory.trim() || undefined,
          defaultVersion: defaultVersion.trim() || undefined,
        },
      });
      setDraftResult(result);
      setDraftMarkdown(result.draftMarkdown);
      setOriginalDraftMarkdown(result.draftMarkdown);
      setClauseReviewItems(buildClauseReviewItems(result.draftMarkdown));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoadingDraft(false);
    }
  }

  async function handleRegisterDraft(): Promise<void> {
    if (!draftMarkdown.trim()) {
      setError("请先生成并确认 Markdown 草稿。");
      return;
    }
    if (!preRegisterReview) {
      setError("未生成审阅结果，请先完成草稿生成。");
      return;
    }

    setLoadingRegister(true);
    setError("");
    const decision = preRegisterReview.finalDecision;

    if (decision.status === "blocked") {
      setRegisterResult({
        success: false,
        stage: "pre_register_review",
        error: "PRE_REGISTER_BLOCKED",
        reasons: decision.blockingReasons,
        lintResult: null,
        compileResult: null,
        spu: null,
        specbundle: null,
        preRegisterReview,
        riskReview: preRegisterReview.riskReview,
      });
      setRegisterRiskNotice(decision.blockingReasons.join("；") || "当前不允许注册，请先处理阻断项。");
      setError("PRE_REGISTER_BLOCKED");
      setLoadingRegister(false);
      return;
    }

    if (decision.status === "warning") {
      const confirmed =
        typeof window === "undefined"
          ? true
          : window.confirm("存在风险项，确认继续注册？");
      if (!confirmed) {
        setRegisterRiskNotice("已取消注册，请先处理风险项。");
        setLoadingRegister(false);
        return;
      }
      setRegisterRiskNotice("已确认风险项，继续执行 lint / compile / register。");
    } else {
      setRegisterRiskNotice("");
    }

    try {
      const result = await registerMarkdownSpec(draftMarkdown, draftResult?.warnings ?? [], {
        source: "pdf",
        originalDraftMarkdown: originalDraftMarkdown || draftMarkdown,
        editedMarkdown: draftMarkdown,
        clauseReviewItems,
      });
      setRegisterResult(result);
      const hasHighRunningContainer = Boolean(
        result.runningImpactScan?.affectedContainers.some((item) => item.containerState === "running" && item.impactLevel === "high"),
      );
      const impactLevel = result.specImpactAnalysis?.impactLevel;
      if (hasHighRunningContainer) {
        setRegisterRiskNotice("当前存在运行中的旧版执行实例，请人工评估后再启用新版本。");
      } else if (impactLevel === "high") {
        setRegisterRiskNotice("规范升级影响为 high：会影响执行逻辑，请人工复核后再安排上线。");
      } else if (impactLevel === "medium") {
        setRegisterRiskNotice("规范升级影响为 medium：允许继续，但建议人工复核。");
      } else if (impactLevel === "low" && result.specImpactAnalysis?.hasImpact) {
        setRegisterRiskNotice("规范升级影响为 low：仅描述性或低风险变化。");
      }
      if (result.success) {
        await props.onRegistered?.(result);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoadingRegister(false);
    }
  }

  const lint = registerResult && "lint" in registerResult ? registerResult.lint : null;
  const blockRegister = preRegisterReview?.finalDecision.status === "blocked";

  return (
    <section className="rounded-xl bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold">PDF 半自动转 Markdown</h2>
      <p className="mt-1 text-sm text-slate-500">
        Draft Markdown → Warning Risk Review → Diff Review → Clause Review → Pre-Register Gate → Lint → Compile → Register
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-4">
        <label className="text-sm lg:col-span-1">
          <span className="mb-1 block font-medium">PDF 文件</span>
          <input
            className="block w-full text-sm"
            type="file"
            accept=".pdf,application/pdf"
            onChange={(event) => setPdfFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">standardCode</span>
          <input
            className="w-full rounded border border-slate-300 px-3 py-2"
            value={standardCode}
            onChange={(event) => setStandardCode(event.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">defaultCategory</span>
          <input
            className="w-full rounded border border-slate-300 px-3 py-2"
            value={defaultCategory}
            onChange={(event) => setDefaultCategory(event.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">defaultVersion</span>
          <input
            className="w-full rounded border border-slate-300 px-3 py-2"
            value={defaultVersion}
            onChange={(event) => setDefaultVersion(event.target.value)}
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-60"
          type="button"
          disabled={loadingDraft || !pdfFile}
          onClick={() => void handleGenerateDraft()}
        >
          {loadingDraft ? "生成中..." : "生成 Markdown 草稿"}
        </button>
        <button
          className="rounded bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-60"
          type="button"
          disabled={loadingRegister || !draftMarkdown.trim() || blockRegister}
          onClick={() => void handleRegisterDraft()}
        >
          {loadingRegister ? "提交中..." : "校验并注册"}
        </button>
      </div>

      {registerRiskNotice ? (
        <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">{registerRiskNotice}</p>
      ) : null}

      {error ? <p className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      {draftResult ? (
        <div className="mt-3 space-y-3">
          <p
            className={`rounded border px-3 py-2 text-sm ${
              draftResult.ocrUsed ? "border-amber-300 bg-amber-50 text-amber-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"
            }`}
          >
            {draftResult.ocrUsed ? "已启用 OCR 识别" : "未启用 OCR（文本抽取成功）"}
          </p>
          <details className="rounded border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">rawText 预览（折叠）</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{draftResult.rawText}</pre>
          </details>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">draftMarkdown（可编辑）</span>
            <textarea
              className="h-72 w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs"
              value={draftMarkdown}
              onChange={(event) => setDraftMarkdown(event.target.value)}
            />
          </label>

          <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-semibold">warnings</p>
            {draftResult.warnings.length === 0 ? (
              <p className="mt-1 text-emerald-700">无警告</p>
            ) : (
              <ul className="mt-1 list-disc space-y-1 pl-5 text-amber-700">
                {draftResult.warnings.map((item, index) => (
                  <li key={`${item.code}-${index}`}>
                    [{item.code}] {item.message}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-semibold">Clause Review（人工确认）</p>
            <p className="mt-1 text-slate-600">高风险 required 项未确认会阻断注册；中风险未确认会进入 warning。</p>
            <ul className="mt-2 space-y-2">
              {clauseReviewItems.map((item) => (
                <li key={item.id} className="rounded border border-slate-200 bg-white px-2 py-2">
                  <label className="flex items-start gap-2">
                    <input
                      className="mt-1"
                      type="checkbox"
                      checked={item.confirmed}
                      onChange={(event) => toggleClauseConfirmed(item.id, event.target.checked)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`inline-block rounded border px-2 py-0.5 text-xs ${clauseBadgeClass(item.riskLevel)}`}>{item.riskLevel}</span>
                      <span className="ml-2 font-medium">{item.title}</span>
                      <span className="ml-2 text-xs text-slate-500">{item.required ? "required" : "optional"}</span>
                      <p className="mt-1 text-xs text-slate-600">{item.message}</p>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {clauseReview ? (
              <p className="mt-2 text-xs text-slate-600">
                required 已确认：{clauseReview.summary.requiredConfirmed}/{clauseReview.summary.requiredTotal}；高风险未确认：
                {clauseReview.summary.highRequiredUnconfirmed}；中风险未确认：{clauseReview.summary.mediumUnconfirmed}
              </p>
            ) : null}
          </div>

          <PreRegisterReviewGatePanel review={preRegisterReview} />
          <WarningRiskReviewPanel review={warningRiskReview} />
          <DraftDiffReviewPanel review={diffReview} />
        </div>
      ) : null}

      {registerResult ? (
        <div className="mt-3 space-y-3">
          <SpecImpactAnalysisPanel
            analysis={registerResult.specImpactAnalysis ?? null}
            baseSpuId={registerResult.specImpactBaseSpuId ?? null}
          />
          <RunningImpactScanPanel scan={registerResult.runningImpactScan ?? null} />
          <SpuActivationPolicyPanel activation={registerResult.spuActivationPolicy ?? null} />

          <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
            <p>
              <strong>注册阶段:</strong> {registerResult.stage}
            </p>
            {registerResult.stage === "pre_register_review" || registerResult.stage === "risk_review" ? (
              <p className="text-rose-700">
                <strong>审阅拦截:</strong> {registerResult.error}
              </p>
            ) : (
              <p>
                <strong>lint:</strong> {lint?.valid ? "通过" : "失败"}
              </p>
            )}
            {registerResult.success ? (
              <p>
                <strong>spuId:</strong> {registerResult.spuId}
              </p>
            ) : null}
            {!registerResult.success && registerResult.stage === "register" ? (
              <p className="text-rose-700">
                <strong>注册结果:</strong> {registerResult.error}
              </p>
            ) : null}
            {lint?.errors.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-rose-700">
                {lint.errors.map((item, index) => (
                  <li key={`${item.code}-${index}`}>
                    [{item.code}] {item.section}: {item.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
