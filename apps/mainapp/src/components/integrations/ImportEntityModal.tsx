import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, PackageSearch } from 'lucide-react';
import type { StoreDTO } from '@zetsales/shared';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/ToastProvider';

const AUTO_CLOSE_MS = 2200;

interface EntityCopy {
  title: (storeName: string) => string;
  subtitle: string;
  steps: string[];
  noun: string;
  connectingLabel: string;
  fetchingLabel: string;
  countKey: string;
  doneSummary: (count: number) => string;
}

const ENTITY_COPY: Record<'products' | 'orders', EntityCopy> = {
  products: {
    title: (storeName) => `Import products from ${storeName}`,
    subtitle: 'Bring your catalog into ZetSales.',
    steps: [
      'Connect to your store’s product catalog',
      'Pull every product and variant (price, SKU, stock)',
      'Match them into ZetSales so orders can reference real inventory',
    ],
    noun: 'products',
    connectingLabel: 'Connecting...',
    fetchingLabel: 'Fetching your catalog...',
    countKey: 'productCount',
    doneSummary: (count) => `Your catalog is up to date — ${count.toLocaleString()} products in ZetSales.`,
  },
  orders: {
    title: (storeName) => `Import orders from ${storeName}`,
    subtitle: 'Bring your order history into ZetSales.',
    steps: [
      'Connect to your store’s order history',
      'Pull every order — customer, total, payment and fulfillment status',
      'Match them into ZetSales so you can manage them alongside new ones',
    ],
    noun: 'orders',
    connectingLabel: 'Connecting...',
    fetchingLabel: 'Fetching your order history...',
    countKey: 'orderCount',
    doneSummary: (count) => `You're up to date — ${count.toLocaleString()} orders in ZetSales.`,
  },
};

interface ImportEntityModalProps {
  entity: 'products' | 'orders';
  store: StoreDTO | null;
  onClose: () => void;
  onImported: (storeId: string, count: number) => void;
  autoStart?: boolean;
}

type ImportState =
  | { phase: 'idle' }
  | { phase: 'importing'; imported: number; total: number; lastTitle: string }
  | { phase: 'done'; imported: number; count: number }
  | { phase: 'error'; message: string };

export function ImportEntityModal({ entity, store, onClose, onImported, autoStart }: ImportEntityModalProps) {
  const copy = ENTITY_COPY[entity];
  const toast = useToast();
  const [state, setState] = useState<ImportState>({ phase: 'idle' });
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    setState({ phase: 'idle' });
    return () => {
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, [store?.id]);

  useEffect(() => {
    if (autoStart && store) startImport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, store?.id]);

  useEffect(() => {
    if (state.phase !== 'done') return;
    const timer = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  if (!store) return null;

  function startImport() {
    setState({ phase: 'importing', imported: 0, total: 0, lastTitle: '' });
    const suffix = entity === 'orders' ? '/orders/import/stream' : '/import/stream';
    const source = new EventSource(`/api/v1/commerce/stores/${store!.id}${suffix}`, { withCredentials: true });
    sourceRef.current = source;

    source.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      switch (payload.type) {
        case 'start':
          setState({ phase: 'importing', imported: 0, total: payload.total, lastTitle: '' });
          break;
        case 'progress':
          setState({ phase: 'importing', imported: payload.imported, total: payload.total, lastTitle: payload.title });
          break;
        case 'done': {
          const count = payload[copy.countKey] ?? payload.imported;
          setState({ phase: 'done', imported: payload.imported, count });
          onImported(store!.id, count);
          toast.push(`Imported ${payload.imported} ${payload.imported === 1 ? copy.noun.slice(0, -1) : copy.noun} from ${store!.displayName}.`);
          source.close();
          break;
        }
        case 'error':
          setState({ phase: 'error', message: payload.message });
          source.close();
          break;
      }
    };

    source.onerror = () => {
      setState((prev) => (prev.phase === 'importing' ? { phase: 'error', message: 'Connection lost during import.' } : prev));
      source.close();
    };
  }

  const cancelImport = () => {
    sourceRef.current?.close();
    sourceRef.current = null;
    setState({ phase: 'idle' });
  };

  const percent = state.phase === 'importing' && state.total > 0 ? Math.min(100, Math.round((state.imported / state.total) * 100)) : 0;

  return (
    <Modal open={Boolean(store)} onClose={onClose} title={copy.title(store.displayName)} subtitle={copy.subtitle}>
      {state.phase === 'idle' && (
        <div className="space-y-4">
          <ol className="space-y-3">
            {copy.steps.map((step) => (
              <li key={step} className="flex items-start gap-3 text-sm text-slate-600">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">
                  {copy.steps.indexOf(step) + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <button
            onClick={startImport}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <PackageSearch size={15} /> Start import
          </button>
        </div>
      )}

      {state.phase === 'importing' && (
        <div className="space-y-4 py-1">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-slate-800 tabular-nums">
              {state.total > 0 ? (
                <>
                  {state.imported.toLocaleString()} <span className="text-slate-400 font-normal">of</span> {state.total.toLocaleString()} imported
                </>
              ) : (
                copy.connectingLabel
              )}
            </span>
            {state.total > 0 && <span className="text-xs font-medium text-slate-400 tabular-nums">{percent}%</span>}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={
                state.total > 0
                  ? 'h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300 ease-out'
                  : 'h-full w-1/3 animate-pulse rounded-full bg-indigo-300'
              }
              style={state.total > 0 ? { width: `${percent}%` } : undefined}
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 size={12} className="shrink-0 animate-spin" />
            <span className="truncate">{state.lastTitle ? `Importing: ${state.lastTitle}` : copy.fetchingLabel}</span>
          </div>
          <button onClick={cancelImport} className="text-xs font-medium text-slate-400 hover:text-slate-600">
            Cancel
          </button>
        </div>
      )}

      {state.phase === 'done' && (
        <div className="flex flex-col items-center gap-3 py-5 text-center">
          <div className="flex h-14 w-14 animate-pop-in items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 size={28} className="text-emerald-600" />
          </div>
          <p className="text-base font-bold text-slate-900">
            {state.imported.toLocaleString()} {copy.noun} imported
          </p>
          <p className="text-xs text-slate-500">{copy.doneSummary(state.count)}</p>
          <div className="mt-1 h-0.5 w-24 overflow-hidden rounded-full bg-slate-100">
            <div
              key={state.imported}
              className="h-full rounded-full bg-emerald-400"
              style={{ animation: `shrink-width ${AUTO_CLOSE_MS}ms linear forwards` }}
            />
          </div>
        </div>
      )}

      {state.phase === 'error' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{state.message}</div>
          <button
            onClick={startImport}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Try again
          </button>
        </div>
      )}
    </Modal>
  );
}
