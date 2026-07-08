import { Package } from 'lucide-react';
import clsx from 'clsx';
import type { OrderLineItemDTO } from '@zetsales/shared';
import { Popover } from '../ui/Popover';

interface ThumbProps {
  item: OrderLineItemDTO | undefined;
  size: number;
  className?: string;
}

function Thumb({ item, size, className }: ThumbProps) {
  return (
    <div
      className={clsx('flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 ring-2 ring-white', className)}
      style={{ width: size, height: size }}
    >
      {item?.image ? <img src={item.image} alt="" className="h-full w-full object-cover" /> : <Package size={size * 0.45} className="text-slate-400" />}
    </div>
  );
}

interface OrderProductsCellProps {
  lineItems: OrderLineItemDTO[];
  currency: string;
}

// A stacked thumbnail cluster (like an avatar group) instead of "first item + '+N more' text" —
// glanceable at a distance, and hovering opens the full itemized breakdown with quantities and
// line totals, the way Shopify/Amazon order lists let you preview a multi-item order without
// opening it.
export function OrderProductsCell({ lineItems, currency }: OrderProductsCellProps) {
  const first = lineItems[0];
  const stack = lineItems.slice(0, 3);
  const extraCount = lineItems.length - stack.length;
  const itemsTotal = lineItems.reduce((sum, li) => sum + li.price * li.quantity, 0);

  if (lineItems.length === 0) {
    return (
      <div className="flex items-center gap-2.5">
        <Thumb item={undefined} size={36} />
        <p className="text-slate-400">No product</p>
      </div>
    );
  }

  return (
    <Popover
      align="left"
      widthClass="w-80"
      trigger={() => (
        <div className="flex items-center gap-3 cursor-pointer">
          <div className="relative flex shrink-0 items-center" style={{ width: 24 + stack.length * 14, height: 36 }}>
            {stack.map((li, i) => (
              <div key={i} className="absolute top-0" style={{ left: i * 14, zIndex: stack.length - i }}>
                <Thumb item={li} size={36} />
              </div>
            ))}
            {extraCount > 0 && (
              <div
                className="absolute top-0 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-[11px] font-bold text-white ring-2 ring-white"
                style={{ left: stack.length * 14, zIndex: 0 }}
              >
                +{extraCount}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="max-w-[170px] truncate font-medium text-slate-700">{first.title}</p>
            <p className="text-xs text-slate-400">
              {lineItems.length > 1 ? (
                <span className="font-medium text-indigo-600">
                  {lineItems.length} items
                </span>
              ) : (
                <>
                  {first.variant ?? `Qty ${first.quantity}`}
                </>
              )}
            </p>
          </div>
        </div>
      )}
    >
      <div className="max-h-96 overflow-y-auto p-3">
        <p className="px-1 pb-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {lineItems.length} item{lineItems.length === 1 ? '' : 's'} in this order
        </p>
        <div className="divide-y divide-slate-100">
          {lineItems.map((li, i) => (
            <div key={i} className="flex items-center gap-3 px-1 py-3 first:pt-0 last:pb-0">
              <Thumb item={li} size={40} className="ring-0" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="truncate text-sm font-medium leading-snug text-slate-700">{li.title}</p>
                <p className="truncate text-xs leading-snug text-slate-400">
                  {li.variant ? `${li.variant} · ` : ''}Qty {li.quantity}
                  {li.sku ? ` · ${li.sku}` : ''}
                </p>
              </div>
              <span className="shrink-0 text-sm font-medium tabular-nums text-slate-700">
                {currency} {(li.price * li.quantity).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 px-1 pt-3 text-sm font-semibold text-slate-800">
          <span>Items total</span>
          <span className="tabular-nums">
            {currency} {itemsTotal.toLocaleString()}
          </span>
        </div>
      </div>
    </Popover>
  );
}
