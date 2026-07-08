import { PhoneCall } from 'lucide-react';

interface PriorityCallsBannerProps {
  count: number;
  onView: () => void;
}

// Unlike the KPI stat tiles above it (which track historical trends), a priority call is "act on
// this right now or the window closes" — a reschedule that's come due, or a multi-SKU cart that's
// still cold. That urgency needs a visible-without-clicking-anything banner, not just another row
// buried in the status dropdown next to purely informational filters.
export function PriorityCallsBanner({ count, onView }: PriorityCallsBannerProps) {
  if (count === 0) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-orange-100 bg-orange-50/70 px-4 py-2.5">
      <div className="flex items-center gap-2 text-sm text-orange-800">
        <PhoneCall size={14} className="shrink-0 text-orange-500" />
        <span>
          <span className="font-semibold">{count}</span> order{count === 1 ? '' : 's'} need{count === 1 ? 's' : ''} a priority call — a reschedule
          is due, or a multi-item cart is still unconfirmed.
        </span>
      </div>
      <button onClick={onView} className="shrink-0 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700">
        Call now
      </button>
    </div>
  );
}
