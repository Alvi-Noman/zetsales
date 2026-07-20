export function MiniBarChart({
  data,
  valueKey,
  labelKey,
  formatValue,
}: {
  data: Record<string, unknown>[];
  valueKey: string;
  labelKey: string;
  formatValue: (n: number) => string;
}) {
  const max = Math.max(...data.map((d) => Number(d[valueKey])), 1);
  return (
    <div className="flex h-40 items-end gap-2.5">
      {data.map((d, i) => {
        const value = Number(d[valueKey]);
        const heightPct = Math.max((value / max) * 100, 4);
        return (
          <div key={i} className="group flex flex-1 flex-col items-center gap-2">
            <div className="relative flex h-32 w-full items-end justify-center">
              <div
                className="w-full max-w-[28px] rounded-t-md bg-gradient-to-t from-indigo-600 to-violet-500 transition-all group-hover:from-indigo-500 group-hover:to-violet-400"
                style={{ height: `${heightPct}%` }}
                title={formatValue(value)}
              />
            </div>
            <span className="text-[11px] font-medium text-slate-500">{String(d[labelKey])}</span>
          </div>
        );
      })}
    </div>
  );
}
