import type { ChangeEvent } from 'react';
import type { ProductOptionDTO, ProductSourcePlatform, ProductWeightUnit } from '@zetsales/shared';
import { ImageGalleryUpload } from './ImageGalleryUpload';
import { OptionsBuilder } from './OptionsBuilder';
import { VariantTable, type VariantFormRow } from './VariantTable';

export interface ProductFormState {
  title: string;
  description: string;
  category: string;
  images: string[];
  weight: string;
  weightUnit: ProductWeightUnit;
  sourceUrl?: string;
  sourcePlatform?: ProductSourcePlatform;
  options: ProductOptionDTO[];
  variants: VariantFormRow[];
}

const EMPTY_VARIANT: VariantFormRow = { sku: '', price: '', compareAtPrice: '', optionValues: [], continueSellingWhenOutOfStock: true, title: '', imageUrl: null, initialQuantity: '' };

export const EMPTY_PRODUCT_FORM: ProductFormState = {
  title: '',
  description: '',
  category: '',
  images: [],
  weight: '',
  weightUnit: 'kg',
  options: [],
  variants: [EMPTY_VARIANT],
};

function cartesianProduct(arrays: string[][]): string[][] {
  return arrays.reduce<string[][]>((acc, curr) => acc.flatMap((combo) => curr.map((value) => [...combo, value])), [[]]);
}

interface ProductFormFieldsProps {
  value: ProductFormState;
  onChange: (next: ProductFormState) => void;
  showInitialQuantity?: boolean;
}

export function ProductFormFields({ value, onChange, showInitialQuantity }: ProductFormFieldsProps) {
  const setText = (key: 'title' | 'description' | 'category') => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...value, [key]: e.target.value });

  // Regenerates the variant matrix whenever options change, preserving price/SKU for combinations
  // that still exist (matched by their option-value tuple) so editing one option's values doesn't
  // wipe data already entered for the combinations that survive.
  const handleOptionsChange = (options: ProductOptionDTO[]) => {
    const combos = options.length > 0 && options.every((o) => o.values.length > 0) ? cartesianProduct(options.map((o) => o.values)) : [];
    const existingByKey = new Map(value.variants.map((v) => [v.optionValues.join('|'), v]));
    const variants = combos.length > 0 ? combos.map((combo) => existingByKey.get(combo.join('|')) ?? { ...EMPTY_VARIANT, optionValues: combo }) : [value.variants[0] ?? EMPTY_VARIANT];
    onChange({ ...value, options, variants });
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Product title</label>
        <input
          value={value.title}
          onChange={setText('title')}
          placeholder="e.g. 18K Gold Plated Necklace"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Description</label>
        <textarea
          value={value.description}
          onChange={setText('description')}
          rows={3}
          placeholder="Optional"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Category</label>
        <input
          value={value.category}
          onChange={setText('category')}
          placeholder="Optional, e.g. Jewelry"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Weight</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={value.weight}
            onChange={(e) => onChange({ ...value, weight: e.target.value })}
            placeholder="Optional"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Unit</label>
          <select
            value={value.weightUnit}
            onChange={(e) => onChange({ ...value, weightUnit: e.target.value as ProductWeightUnit })}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
          >
            <option value="kg">kg</option>
            <option value="g">g</option>
            <option value="lb">lb</option>
            <option value="oz">oz</option>
          </select>
        </div>
      </div>

      <ImageGalleryUpload images={value.images} onChange={(images) => onChange({ ...value, images })} />

      <OptionsBuilder options={value.options} onChange={handleOptionsChange} />

      <VariantTable
        options={value.options}
        variants={value.variants}
        productImages={value.images}
        onChange={(variants) => onChange({ ...value, variants })}
        showInitialQuantity={showInitialQuantity}
      />
    </div>
  );
}
