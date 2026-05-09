import { type ChangeEvent, useMemo, useRef, useState } from "react";

import { loadSpecBundle, registerBundleSpec, SpecBundleError, type LoadedSpecBundleData } from "../lib/specbundle-loader.ts";

import type { RuntimeSpuEntry } from "../spu-registry.ts";

export type SpecBundleImportSuccess = {
  bundleData: LoadedSpecBundleData;
  entry: RuntimeSpuEntry;
};

type ImportResult =
  | {
      ok: true;
      specId: string;
      addedToRegistry: boolean;
      sourceType: string;
    }
  | {
      ok: false;
      error: string;
    }
  | null;

type SpecBundleImportPanelProps = {
  onImported: (payload: SpecBundleImportSuccess) => Promise<void> | void;
};

function formatImportError(error: unknown): string {
  if (error instanceof SpecBundleError) {
    return `${error.code}${error.message ? `: ${error.message}` : ""}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export default function SpecBundleImportPanel(props: SpecBundleImportPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult>(null);
  const [lastFileName, setLastFileName] = useState<string>("");

  const resultClassName = useMemo(() => {
    if (!result) {
      return "specbundle-result";
    }
    return result.ok ? "specbundle-result success" : "specbundle-result error";
  }, [result]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setResult(null);
      setLastFileName("");
      return;
    }

    setLoading(true);
    setResult(null);
    setLastFileName(file.name);

    try {
      const bundleData = await loadSpecBundle(file);
      const entry = registerBundleSpec(bundleData);
      await props.onImported({ bundleData, entry });

      setResult({
        ok: true,
        specId: entry.spu.spuId,
        addedToRegistry: true,
        sourceType: entry.registryItem.sourceType,
      });
    } catch (error) {
      setResult({
        ok: false,
        error: formatImportError(error),
      });
    } finally {
      setLoading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  return (
    <section className="spu-panel">
      <div className="spu-section-title">
        <h2>导入规范包（SpecBundle）</h2>
      </div>

      <div className="specbundle-import-grid">
        <label className="specbundle-upload">
          <span>上传 .specbundle</span>
          <input
            ref={inputRef}
            type="file"
            accept=".specbundle,application/octet-stream"
            onChange={handleFileChange}
            disabled={loading}
          />
          <small>{lastFileName ? `当前文件：${lastFileName}` : "未选择任何文件"}</small>
        </label>

        <article className={resultClassName}>
          <span>导入结果</span>
          {result ? (
            result.ok ? (
              <>
                <strong>{result.specId}</strong>
                <p>导入成功：是</p>
                <p>已加入 SPU 列表：{result.addedToRegistry ? "是" : "否"}</p>
                <p>来源类型：{result.sourceType}</p>
              </>
            ) : (
              <>
                <strong>导入失败</strong>
                <p>{result.error}</p>
              </>
            )
          ) : (
            <>
              <strong>等待导入</strong>
              <p>支持上传本地 `.specbundle`，导入后会自动加入当前 SPU 列表。</p>
            </>
          )}
        </article>
      </div>
    </section>
  );
}
