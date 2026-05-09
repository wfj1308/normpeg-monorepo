import { type FormEvent, useState } from "react";

export type CompileOutcome = {
  ok: boolean;
  spuId?: string;
  registered?: boolean;
  visibleInList?: boolean;
  error?: string;
};

type NormDocCompilePanelProps = {
  onCompile: (rawText: string) => Promise<CompileOutcome>;
};

const DEFAULT_NORMDOC = `{
  "norm": "JTG F80/1-2017",
  "clause": "4.2.1",
  "category": "路基工程",
  "workItem": "土方路基",
  "measuredItem": "压实度",
  "typeHint": "soil",
  "unit": "%",
  "threshold": 93,
  "testMethods": ["灌砂法", "环刀法"],
  "fields": [
    { "name": "灌入砂质量(g)", "key": "massHoleSand", "type": "number" },
    { "name": "锥体砂质量(g)", "key": "massSandCone", "type": "number" },
    { "name": "标定体积(cm3)", "key": "volumeSand", "type": "number" },
    { "name": "含水率(%)", "key": "moistureContent", "type": "number" },
    { "name": "最大干密度(g/cm3)", "key": "maxDryDensity", "type": "number" }
  ]
}`;

export default function NormDocCompilePanel(props: NormDocCompilePanelProps) {
  const [value, setValue] = useState(DEFAULT_NORMDOC);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompileOutcome | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      const next = await props.onCompile(value);
      setResult(next);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="spu-panel">
      <div className="spu-section-title">
        <h2>NormDoc 转 SPU 编译</h2>
      </div>

      <form onSubmit={handleSubmit} className="normdoc-compile-form">
        <label className="normdoc-compile-field">
          <span>NormDoc JSON 内容</span>
          <textarea value={value} onChange={(event) => setValue(event.target.value)} rows={16} spellCheck={false} />
        </label>

        <div className="spu-actions">
          <button type="submit" disabled={loading}>
            {loading ? "编译中..." : "编译并注册 SPU"}
          </button>
        </div>
      </form>

      {result ? (
        <article className="normdoc-compile-result">
          <span>编译结果</span>
          <strong>{result.ok ? result.spuId : result.error}</strong>
          <p>注册状态：{result.ok ? (result.registered ? "已注册" : "未注册") : "失败"}</p>
          <p>列表可见：{result.ok ? (result.visibleInList ? "已显示" : "未显示") : "否"}</p>
        </article>
      ) : null}
    </section>
  );
}
