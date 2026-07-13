import { ArrowLeft, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import { Select } from '../ui/Select';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Builds a compact page-number list with '...' gap markers, e.g. [1, '...', 4, 5, 6, '...', 42] —
// always keeps the first/last page and a small window around the current one visible.
function buildPageList(current: number, total: number, siblings = 1): (number | '...')[] {
  if (total <= 1) return [1];

  const pages = new Set<number>([1, total]);
  for (let i = current - siblings; i <= current + siblings; i++) {
    if (i >= 1 && i <= total) pages.add(i);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | '...')[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) result.push('...');
    result.push(p);
    prev = p;
  }
  return result;
}

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  rangeStart: number;
  rangeEnd: number;
  pageSize: number;
  loading: boolean;
  onGoToPage: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function Pagination({ page, totalPages, total, rangeStart, rangeEnd, pageSize, loading, onGoToPage, onPageSizeChange }: PaginationProps) {
  const pages = buildPageList(page, totalPages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-2.5">
      <span className="text-xs text-slate-400">
        Showing <span className="font-medium text-slate-600">{rangeStart}</span>–<span className="font-medium text-slate-600">{rangeEnd}</span> of{' '}
        <span className="font-medium text-slate-600">{total.toLocaleString()}</span> orders
      </span>

      <div className="flex items-center gap-3">
        <Select
          value={String(pageSize)}
          onChange={(v) => onPageSizeChange(Number(v))}
          options={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: `${n}/page` }))}
          className="py-1 text-xs"
        />

        <div className="flex items-center gap-1">
          <button
            onClick={() => onGoToPage(page - 1)}
            disabled={page <= 1 || loading}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeft size={12} />
          </button>
          {pages.map((p, i) =>
            p === '...' ? (
              <span key={`gap-${i}`} className="px-1.5 text-xs text-slate-300">
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onGoToPage(p)}
                disabled={loading}
                className={clsx(
                  'min-w-[28px] rounded-lg px-2 py-1.5 text-xs font-medium',
                  p === page ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                {p}
              </button>
            )
          )}
          <button
            onClick={() => onGoToPage(page + 1)}
            disabled={page >= totalPages || loading}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
