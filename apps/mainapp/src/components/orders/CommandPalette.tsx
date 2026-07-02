import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ArrowRight, Command, Zap } from 'lucide-react';
import clsx from 'clsx';
import type { OrderDTO, OrderTabKey } from '@zetsales/shared';
import { listOrders } from '../../lib/commerceApi';
import { STAGE_TONE } from './orderTone';
import { ORDER_TABS } from './tabs';

interface QuickAction {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelectTab: (tab: OrderTabKey) => void;
  onOpenOrder: (order: OrderDTO) => void;
  onClearFilters: () => void;
  onFocusSearch: () => void;
  selectedCount: number;
  onBulkConfirmSelected: () => void;
}

export function CommandPalette({
  open,
  onClose,
  onSelectTab,
  onOpenOrder,
  onClearFilters,
  onFocusSearch,
  selectedCount,
  onBulkConfirmSelected,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OrderDTO[]>([]);
  const [searching, setSearching] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setHighlighted(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await listOrders({ search: query.trim(), pageSize: 6 });
        setResults(res.orders);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, open]);

  const actions = useMemo<QuickAction[]>(() => {
    const list: QuickAction[] = [
      { id: 'focus-search', label: 'Focus search box', hint: 'Filter table', run: onFocusSearch },
      { id: 'clear-filters', label: 'Clear all filters', hint: 'Reset to default view', run: onClearFilters },
      ...ORDER_TABS.map((tab) => ({ id: `tab-${tab.key}`, label: `Go to "${tab.label}" tab`, run: () => onSelectTab(tab.key) })),
    ];
    if (selectedCount > 0) {
      list.unshift({
        id: 'bulk-confirm',
        label: `Confirm ${selectedCount} selected order${selectedCount === 1 ? '' : 's'}`,
        hint: 'Bulk action',
        run: onBulkConfirmSelected,
      });
    }
    if (!query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter((a) => a.label.toLowerCase().includes(q));
  }, [query, selectedCount, onFocusSearch, onClearFilters, onSelectTab, onBulkConfirmSelected]);

  const flatItems = useMemo(() => [...results.map((o) => ({ type: 'order' as const, order: o })), ...actions.map((a) => ({ type: 'action' as const, action: a }))], [
    results,
    actions,
  ]);

  useEffect(() => setHighlighted(0), [flatItems.length]);

  const activate = (index: number) => {
    const item = flatItems[index];
    if (!item) return;
    if (item.type === 'order') onOpenOrder(item.order);
    else item.action.run();
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center bg-slate-900/50 pt-[12vh]" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
          <Search size={16} className="shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlighted((h) => Math.min(h + 1, flatItems.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlighted((h) => Math.max(h - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                activate(highlighted);
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            placeholder="Search orders, or jump to a tab/action..."
            className="flex-1 text-sm text-slate-900 placeholder-slate-400 outline-none"
          />
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">Esc</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto py-1.5">
          {searching && <div className="px-4 py-3 text-xs text-slate-400">Searching...</div>}

          {results.length > 0 && (
            <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Orders</div>
          )}
          {results.map((order, i) => (
            <button
              key={order.id}
              onMouseEnter={() => setHighlighted(i)}
              onClick={() => activate(i)}
              className={clsx('flex w-full items-center gap-3 px-4 py-2 text-left text-sm', highlighted === i ? 'bg-indigo-50' : 'hover:bg-slate-50')}
            >
              <span className="font-medium text-slate-800">{order.number}</span>
              <span className="truncate text-slate-400">{order.customerName || 'No name'}</span>
              <span className={clsx('ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset', STAGE_TONE[order.stage])}>
                {order.stage}
              </span>
            </button>
          ))}

          {actions.length > 0 && (
            <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Actions</div>
          )}
          {actions.map((action, i) => {
            const flatIndex = results.length + i;
            return (
              <button
                key={action.id}
                onMouseEnter={() => setHighlighted(flatIndex)}
                onClick={() => activate(flatIndex)}
                className={clsx(
                  'flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm',
                  highlighted === flatIndex ? 'bg-indigo-50' : 'hover:bg-slate-50'
                )}
              >
                {action.id === 'bulk-confirm' ? <Zap size={13} className="shrink-0 text-indigo-500" /> : <ArrowRight size={13} className="shrink-0 text-slate-300" />}
                <span className="text-slate-700">{action.label}</span>
                {action.hint && <span className="ml-auto text-xs text-slate-400">{action.hint}</span>}
              </button>
            );
          })}

          {!searching && results.length === 0 && actions.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-slate-400">No matches.</div>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <Command size={11} /> K to open
          </span>
          <span>↑↓ to navigate</span>
          <span>↵ to select</span>
        </div>
      </div>
    </div>
  );
}
