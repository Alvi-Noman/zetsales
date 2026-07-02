import { Columns3 } from 'lucide-react';
import { Popover } from '../ui/Popover';
import { COLUMN_DEFS, type ColumnKey } from './columns';

interface ColumnsMenuProps {
  visible: Set<ColumnKey>;
  onToggle: (key: ColumnKey) => void;
}

export function ColumnsMenu({ visible, onToggle }: ColumnsMenuProps) {
  return (
    <Popover
      align="right"
      widthClass="w-48"
      trigger={() => (
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">
          <Columns3 size={13} className="text-slate-400" />
          Columns
        </div>
      )}
    >
      <div className="space-y-0.5 p-2">
        {COLUMN_DEFS.map((col) => (
          <label key={col.key} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">
            <input
              type="checkbox"
              checked={visible.has(col.key)}
              onChange={() => onToggle(col.key)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            {col.label}
          </label>
        ))}
      </div>
    </Popover>
  );
}
