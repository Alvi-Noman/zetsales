import type { ProductOptionDTO } from '@zetsales/shared';

export interface VariantFormRow {
  sku: string;
  price: string;
  compareAtPrice: string;
  optionValues: string[];
  continueSellingWhenOutOfStock: boolean;
  // Read-only display label for a variant that predates ZetSales' options system — some products
  // synced from Shopify carry real, distinctly-named variants (colors, sizes, whatever the seller
  // called them) with no structured option data behind them at all, so optionValues is empty for
  // every one of them. Without this, every one of those variants renders as an indistinguishable
  // blank row. Never sent back on save — it's derived from the store's data, not editable here.
  title: string;
}

interface VariantTableProps {
  options: ProductOptionDTO[];
  variants: VariantFormRow[];
  onChange: (variants: VariantFormRow[]) => void;
}

export function VariantTable({ options, variants, onChange }: VariantTableProps) {
  const updateVariant = (index: number, patch: Partial<VariantFormRow>) => onChange(variants.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  // Only the "several real variants, no configured options" case needs the fallback label — a
  // genuinely single-variant product's title (Shopify's own placeholder is literally "Default
  // Title") isn't meaningful to show next to its one and only price/SKU row.
  const showFallbackLabel = options.length === 0 && variants.length > 1;

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">{options.length > 0 ? 'Variants' : 'Price & SKU'}</label>
      <div className="space-y-2 rounded-lg border border-slate-200 p-2.5">
        {variants.map((variant, i) => (
          <div key={variant.optionValues.join('|') || i} className="flex items-center gap-2">
            {options.length > 0 && <span className="w-28 shrink-0 truncate text-sm font-medium text-slate-700">{variant.optionValues.join(' / ')}</span>}
            {showFallbackLabel && <span className="w-28 shrink-0 truncate text-sm font-medium text-slate-700">{variant.title || `Variant ${i + 1}`}</span>}
            <input
              type="number"
              min="0"
              step="0.01"
              value={variant.price}
              onChange={(e) => updateVariant(i, { price: e.target.value })}
              placeholder="Price"
              className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={variant.compareAtPrice}
              onChange={(e) => updateVariant(i, { compareAtPrice: e.target.value })}
              placeholder="Compare-at"
              title="Compare-at price (shown struck through as the original price)"
              className="w-28 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
            <input
              value={variant.sku}
              onChange={(e) => updateVariant(i, { sku: e.target.value })}
              placeholder="SKU (optional)"
              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
            <label
              title="When off, confirming an order for this variant once every warehouse is out of free stock flags it for review instead of confirming clean."
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-slate-600"
            >
              <input
                type="checkbox"
                checked={variant.continueSellingWhenOutOfStock}
                onChange={(e) => updateVariant(i, { continueSellingWhenOutOfStock: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              Sell when out of stock
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
