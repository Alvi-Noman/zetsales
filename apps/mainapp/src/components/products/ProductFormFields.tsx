import type { ChangeEvent } from 'react';

export interface ProductFormState {
  title: string;
  image: string;
  price: string;
  sku: string;
  inventory: string;
}

export const EMPTY_PRODUCT_FORM: ProductFormState = { title: '', image: '', price: '', sku: '', inventory: '' };

interface ProductFormFieldsProps {
  value: ProductFormState;
  onChange: (next: ProductFormState) => void;
}

export function ProductFormFields({ value, onChange }: ProductFormFieldsProps) {
  const set = (key: keyof ProductFormState) => (e: ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: e.target.value });

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Product title</label>
        <input
          value={value.title}
          onChange={set('title')}
          placeholder="e.g. 18K Gold Plated Necklace"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Image URL</label>
        <input
          value={value.image}
          onChange={set('image')}
          placeholder="https://..."
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Price (৳)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={value.price}
            onChange={set('price')}
            placeholder="0.00"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">SKU</label>
          <input
            value={value.sku}
            onChange={set('sku')}
            placeholder="Optional"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Stock</label>
          <input
            type="number"
            min="0"
            value={value.inventory}
            onChange={set('inventory')}
            placeholder="0"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
          />
        </div>
      </div>
    </div>
  );
}
