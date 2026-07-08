import type { ReactNode } from 'react';

export interface RankedTableColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  render: (row: T, index: number) => ReactNode;
}

interface RankedTableProps<T> {
  columns: RankedTableColumn<T>[];
  rows: T[];
  keyField: (row: T) => string;
  emptyLabel?: string;
}

// The table-view relief channel every chart on this page can fall back to — same data, always
// reachable without hovering a mark. Plain HTML table, text tokens only (no series color on text).
export function RankedTable<T>({ columns, rows, keyField, emptyLabel = 'No data for this period' }: RankedTableProps<T>) {
  if (rows.length === 0) {
    return <div className="flex h-32 items-center justify-center text-sm text-slate-300">{emptyLabel}</div>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[480px] text-left text-[12.5px]">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/70">
            {columns.map((col) => (
              <th key={col.key} className={`px-3.5 py-2.5 font-semibold uppercase tracking-wide text-[10.5px] text-slate-400 ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => (
            <tr key={keyField(row)} className="hover:bg-slate-50/60">
              {columns.map((col) => (
                <td key={col.key} className={`px-3.5 py-2.5 ${col.align === 'right' ? 'text-right tabular-nums' : 'text-left'}`}>
                  {col.render(row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
