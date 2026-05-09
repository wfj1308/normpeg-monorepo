import { useMemo, useState } from "react";

export type ComponentListRow = {
  component_id: string;
  component_short_id: string;
  rule_summary: string;
  executable: boolean;
  hasGate?: boolean;
  review_status?: "unreviewed" | "reviewed" | "issue";
};

type Props = {
  rows: ComponentListRow[];
  selectedId: string;
  onSelect: (componentId: string) => void;
  viewportHeight?: number;
  rowHeight?: number;
  overscan?: number;
};

export default function ComponentVirtualList({
  rows,
  selectedId,
  onSelect,
  viewportHeight = 520,
  rowHeight = 92,
  overscan = 6,
}: Props): JSX.Element {
  const [scrollTop, setScrollTop] = useState(0);
  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
    const endIndex = Math.min(rows.length, startIndex + visibleCount);
    return { startIndex, endIndex };
  }, [overscan, rowHeight, rows.length, scrollTop, viewportHeight]);
  const virtualRows = useMemo(
    () => rows.slice(visibleRange.startIndex, visibleRange.endIndex),
    [rows, visibleRange.endIndex, visibleRange.startIndex],
  );

  return (
    <div
      className="overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/70"
      style={{ height: `${viewportHeight}px` }}
      onScroll={(e) => setScrollTop((e.currentTarget as HTMLDivElement).scrollTop)}
      onKeyDown={(e) => {
        if (!rows.length) return;
        const currentIndex = Math.max(0, rows.findIndex((row) => row.component_id === selectedId));
        if (e.key === "ArrowDown") {
          e.preventDefault();
          const next = rows[Math.min(rows.length - 1, currentIndex + 1)];
          if (next) onSelect(next.component_id);
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          const prev = rows[Math.max(0, currentIndex - 1)];
          if (prev) onSelect(prev.component_id);
        }
      }}
      tabIndex={0}
    >
      <div style={{ height: `${rows.length * rowHeight}px`, position: "relative" }}>
        {virtualRows.map((row, idx) => {
          const absoluteIndex = visibleRange.startIndex + idx;
          const top = absoluteIndex * rowHeight;
          const selected = row.component_id === selectedId;
          return (
            <button
              key={row.component_id}
              type="button"
              className={`absolute left-0 right-0 mx-1 my-1 rounded-md border px-2 py-2 text-left text-xs transition ${selected ? "border-sky-400 bg-slate-800/90" : "border-slate-800 bg-slate-900/70 hover:bg-slate-800/70"} ${row.executable ? "opacity-100" : "opacity-60"}`}
              style={{ top: `${top}px`, height: `${rowHeight - 8}px` }}
              onClick={() => onSelect(row.component_id)}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-mono text-slate-100">{row.component_short_id}</p>
                <div className="flex items-center gap-1">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${row.executable ? "bg-emerald-600/20 text-emerald-200" : "bg-slate-700/70 text-slate-300"}`}>
                    {row.executable ? "可执行" : "不可执行"}
                  </span>
                  {row.review_status === "reviewed" ? <span className="rounded bg-emerald-700/20 px-1.5 py-0.5 text-[10px] text-emerald-200">已校验</span> : null}
                  {row.review_status === "issue" ? <span className="rounded bg-rose-700/20 px-1.5 py-0.5 text-[10px] text-rose-200">有问题</span> : null}
                  {(!row.review_status || row.review_status === "unreviewed") ? <span className="rounded bg-slate-700/70 px-1.5 py-0.5 text-[10px] text-slate-300">未校验</span> : null}
                </div>
              </div>
              <p className="mt-1 truncate text-slate-200">
                {row.rule_summary.length > 56 ? `${row.rule_summary.slice(0, 56)}...` : row.rule_summary}
              </p>
              <p className="mt-1 text-[10px] text-slate-400">
                {row.hasGate ? "有Gate" : "无Gate"}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
