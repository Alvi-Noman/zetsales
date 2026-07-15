import { PackageCheck } from 'lucide-react';

interface RestockedOrdersBannerProps {
  count: number;
  onView: () => void;
}

// Confirmed orders that were short of stock at confirm time (wasShortOfStock) and have since
// become fully coverable — same "act now" urgency as PriorityCallsBanner, since the item sitting
// on the shelf and the customer not yet told is a closing window, not a stat to glance at later.
export function RestockedOrdersBanner({ count, onView }: RestockedOrdersBannerProps) {
  if (count === 0) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/70 px-4 py-2.5">
      <div className="flex items-center gap-2 text-sm text-emerald-800">
        <PackageCheck size={14} className="shrink-0 text-emerald-600" />
        <span>
          <span className="font-semibold">{count}</span> confirmed order{count === 1 ? '' : 's'} {count === 1 ? 'was' : 'were'} out of stock and{' '}
          {count === 1 ? 'is' : 'are'} now back in stock — confirm the customer still wants it before sending to packing.
        </span>
      </div>
      <button onClick={onView} className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
        View orders
      </button>
    </div>
  );
}
