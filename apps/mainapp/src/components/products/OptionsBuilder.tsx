import { Plus, X } from 'lucide-react';
import type { ProductOptionDTO } from '@zetsales/shared';

const MAX_OPTIONS = 3;

interface OptionsBuilderProps {
  options: ProductOptionDTO[];
  onChange: (options: ProductOptionDTO[]) => void;
}

export function OptionsBuilder({ options, onChange }: OptionsBuilderProps) {
  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return;
    onChange([...options, { name: '', values: [] }]);
  };

  const updateName = (index: number, name: string) => onChange(options.map((o, i) => (i === index ? { ...o, name } : o)));
  const removeOption = (index: number) => onChange(options.filter((_, i) => i !== index));

  const commitValues = (index: number, text: string) => {
    const values = text
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    onChange(options.map((o, i) => (i === index ? { ...o, values } : o)));
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="block text-xs font-semibold text-slate-600">Options (e.g. Size, Color)</label>
        {options.length < MAX_OPTIONS && (
          <button type="button" onClick={addOption} className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
            <Plus size={12} /> Add option
          </button>
        )}
      </div>
      {options.length === 0 ? (
        <p className="text-xs text-slate-400">No options yet — this product has a single price/SKU below.</p>
      ) : (
        <div className="space-y-2.5">
          {options.map((option, i) => (
            <div key={i} className="flex items-start gap-2">
              <input
                value={option.name}
                onChange={(e) => updateName(i, e.target.value)}
                placeholder="Name (e.g. Size)"
                className="w-36 shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
              />
              <input
                defaultValue={option.values.join(', ')}
                onBlur={(e) => commitValues(i, e.target.value)}
                placeholder="Values, comma separated (e.g. S, M, L)"
                className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
              />
              <button type="button" onClick={() => removeOption(i)} className="mt-2 shrink-0 text-slate-400 hover:text-rose-600">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
