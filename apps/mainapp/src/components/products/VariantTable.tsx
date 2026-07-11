import { ImageOff } from 'lucide-react';
import clsx from 'clsx';
import type { ProductOptionDTO } from '@zetsales/shared';
import { Popover } from '../ui/Popover';

export interface VariantFormRow {
  sku: string;
  price: string;
  compareAtPrice: string;
  optionValues: string[];
  continueSellingWhenOutOfStock: boolean;
  // Read-only display label for a variant that predates ZetSales' options system — some products
  // synced from Shopify carry real, distinctly-named variants (colors, sizes, whatever the seller
  // called them) with no structured option data behind them at all, so optionValues is empty for
  // every one of them. Never sent back on save — it's derived from the store's data, not editable here.
  title: string;
  // Distinct from the product's shared image gallery — e.g. a color variant's own swatch photo.
  // Assigned by picking from the product's existing images, not a separate upload.
  imageUrl: string | null;
  // Only meaningful on create (see showInitialQuantity below) — an explicit starting stock count,
  // as opposed to the 0/platform-reported default every variant otherwise gets once synced.
  initialQuantity: string;
}

interface VariantTableProps {
  options: ProductOptionDTO[];
  variants: VariantFormRow[];
  productImages: string[];
  onChange: (variants: VariantFormRow[]) => void;
  // Editing an already-tracked product has no "initial" stock to set — this only makes sense while
  // adding a brand-new product, so the column is opt-in rather than always present.
  showInitialQuantity?: boolean;
}

function VariantImagePicker({ imageUrl, productImages, onPick }: { imageUrl: string | null; productImages: string[]; onPick: (url: string | null) => void }) {
  return (
    <Popover
      align="left"
      widthClass="w-48"
      trigger={() => (
        <div className="h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-md border border-slate-200 bg-slate-50 hover:border-indigo-300">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-300">
              <ImageOff size={14} />
            </div>
          )}
        </div>
      )}
    >
      {(close) => (
        <div className="p-2">
          {productImages.length === 0 ? (
            <p className="px-1 py-1 text-xs text-slate-400">Add product images first.</p>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {productImages.map((url) => (
                <button
                  key={url}
                  onClick={() => {
                    onPick(url);
                    close();
                  }}
                  className={clsx('overflow-hidden rounded-md border-2', url === imageUrl ? 'border-indigo-500' : 'border-transparent hover:border-slate-300')}
                >
                  <img src={url} alt="" className="h-10 w-10 object-cover" />
                </button>
              ))}
            </div>
          )}
          {imageUrl && (
            <button
              onClick={() => {
                onPick(null);
                close();
              }}
              className="mt-2 w-full rounded-md px-1 py-1 text-left text-xs text-slate-500 hover:bg-slate-50"
            >
              Remove image
            </button>
          )}
        </div>
      )}
    </Popover>
  );
}

export function VariantTable({ options, variants, productImages, onChange, showInitialQuantity }: VariantTableProps) {
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
            <VariantImagePicker imageUrl={variant.imageUrl} productImages={productImages} onPick={(imageUrl) => updateVariant(i, { imageUrl })} />
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
            {showInitialQuantity && (
              <input
                type="number"
                min="0"
                step="1"
                value={variant.initialQuantity}
                onChange={(e) => updateVariant(i, { initialQuantity: e.target.value })}
                placeholder="Qty"
                title="Starting stock count for this variant — leave blank to track it at 0 for now"
                className="w-20 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
              />
            )}
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
