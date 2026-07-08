import { useEffect, useMemo, useState } from 'react';
import { X, GripVertical, Eye, EyeOff } from 'lucide-react';
import clsx from 'clsx';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { AnalyticsCardKey, AnalyticsCategory, AnalyticsLayoutDTO } from '@zetsales/shared';
import { saveAnalyticsLayout } from '../../lib/analyticsApi';
import { ANALYTICS_CARD_MAP, ANALYTICS_CARDS, ANALYTICS_CATEGORY_ORDER } from '../../analytics/cardRegistry';
import { useToast } from '../ui/ToastProvider';

interface CustomizeDrawerProps {
  open: boolean;
  onClose: () => void;
  layout: AnalyticsLayoutDTO | null;
  onSaved: (layout: AnalyticsLayoutDTO) => void;
}

interface Row {
  key: AnalyticsCardKey;
  hidden: boolean;
}

function buildInitialRows(layout: AnalyticsLayoutDTO | null): Row[] {
  const saved = layout?.cards ?? [];
  const savedKeys = new Set(saved.map((c) => c.key));
  const known = saved.filter((c) => ANALYTICS_CARD_MAP[c.key]);
  const missing = ANALYTICS_CARDS.filter((c) => !savedKeys.has(c.key)).map((c) => ({ key: c.key, hidden: false }));
  return [...known, ...missing];
}

function SortableRow({ row, onToggle }: { row: Row; onToggle: (key: AnalyticsCardKey) => void }) {
  const def = ANALYTICS_CARD_MAP[row.key]!;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.key });
  const Icon = def.icon;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx('flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5', isDragging && 'shadow-lg')}
    >
      <button {...attributes} {...listeners} className="shrink-0 cursor-grab touch-none text-slate-300 hover:text-slate-500 active:cursor-grabbing">
        <GripVertical size={15} />
      </button>
      <Icon size={15} className="shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <p className={clsx('truncate text-sm font-medium', row.hidden ? 'text-slate-400' : 'text-slate-800')}>{def.title}</p>
      </div>
      <button
        onClick={() => onToggle(row.key)}
        className={clsx(
          'flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold',
          row.hidden ? 'bg-slate-100 text-slate-400 hover:bg-slate-200' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
        )}
      >
        {row.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
        {row.hidden ? 'Hidden' : 'Visible'}
      </button>
    </div>
  );
}

// Add/remove/reorder for the entry page's card grid — a dnd-kit sortable list (grouped by
// category) rather than a hand-rolled drag implementation, so keyboard and touch reordering come
// for free. Saves the whole ordered list (including hidden entries, so re-showing a card later
// remembers where it used to sit) to the per-user analyticsLayouts record.
export function CustomizeDrawer({ open, onClose, layout, onSaved }: CustomizeDrawerProps) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>(() => buildInitialRows(layout));
  const [saving, setSaving] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    if (open) setRows(buildInitialRows(layout));
  }, [open, layout]);

  // Same grouping the entry page itself uses: one section per category, each with its own
  // SortableContext, so dragging only ever reorders within a category — matching what the entry
  // page's category headings actually respect (it groups by category regardless of raw array
  // position, so a cross-category drop here would silently not do what it visually suggested).
  const groupedRows = useMemo(() => {
    const groups = new Map<AnalyticsCategory, Row[]>();
    for (const row of rows) {
      const def = ANALYTICS_CARD_MAP[row.key];
      if (!def) continue;
      const list = groups.get(def.category) ?? [];
      list.push(row);
      groups.set(def.category, list);
    }
    return ANALYTICS_CATEGORY_ORDER.map((category) => ({ category, rows: groups.get(category) ?? [] })).filter((g) => g.rows.length > 0);
  }, [rows]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeDef = ANALYTICS_CARD_MAP[active.id as AnalyticsCardKey];
    const overDef = ANALYTICS_CARD_MAP[over.id as AnalyticsCardKey];
    if (!activeDef || !overDef || activeDef.category !== overDef.category) return;
    setRows((current) => {
      const oldIndex = current.findIndex((r) => r.key === active.id);
      const newIndex = current.findIndex((r) => r.key === over.id);
      return arrayMove(current, oldIndex, newIndex);
    });
  };

  const toggle = (key: AnalyticsCardKey) => {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, hidden: !r.hidden } : r)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const nextLayout: AnalyticsLayoutDTO = { cards: rows };
      await saveAnalyticsLayout(nextLayout);
      onSaved(nextLayout);
      toast.push('Analytics layout saved.');
      onClose();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not save your layout.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Customize analytics</h2>
            <p className="text-xs text-slate-400">Show, hide, and reorder the cards on your entry page.</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            {groupedRows.map(({ category, rows: groupRows }) => (
              <div key={category} className="mb-4 last:mb-0">
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">{category}</h3>
                <SortableContext items={groupRows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {groupRows.map((row) => (
                      <SortableRow key={row.key} row={row} onToggle={toggle} />
                    ))}
                  </div>
                </SortableContext>
              </div>
            ))}
          </DndContext>
        </div>

        <div className="border-t border-slate-100 px-6 py-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save layout'}
          </button>
        </div>
      </div>
    </div>
  );
}
