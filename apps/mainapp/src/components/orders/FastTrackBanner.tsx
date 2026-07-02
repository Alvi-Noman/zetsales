import { Zap } from 'lucide-react';

interface FastTrackBannerProps {
  count: number;
  onConfirmAll: () => void;
  loading?: boolean;
}

export function FastTrackBanner({ count, onConfirmAll, loading }: FastTrackBannerProps) {
  if (count === 0) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-indigo-100 bg-indigo-50/70 px-4 py-2.5">
      <div className="flex items-center gap-2 text-sm text-indigo-800">
        <Zap size={14} className="shrink-0 text-indigo-500" />
        <span>
          <span className="font-semibold">{count}</span> order{count === 1 ? '' : 's'} on this page {count === 1 ? 'is' : 'are'} already paid — ready
          to fast-track confirm without a call.
        </span>
      </div>
      <button
        onClick={onConfirmAll}
        disabled={loading}
        className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {loading ? 'Confirming...' : `Confirm all ${count}`}
      </button>
    </div>
  );
}
