import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, X } from 'lucide-react';
import clsx from 'clsx';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  message: string;
  variant: 'success' | 'info';
  action?: ToastAction;
}

interface PushOptions {
  action?: ToastAction;
  duration?: number;
}

interface ToastContextValue {
  push: (message: string, variant?: Toast['variant'], options?: PushOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const push = useCallback((message: string, variant: Toast['variant'] = 'success', options?: PushOptions) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, variant, action: options?.action }]);
    setTimeout(() => {
      setToasts((t) => t.filter((toast) => toast.id !== id));
    }, options?.duration ?? 3200);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              'flex items-center gap-2 rounded-lg border px-4 py-2.5 shadow-lg text-sm font-medium transition-all animate-pop-in',
              'bg-slate-900 text-white border-slate-800'
            )}
          >
            {t.variant === 'success' ? (
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            ) : (
              <Info size={16} className="text-indigo-400 shrink-0" />
            )}
            <span>{t.message}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action?.onClick();
                  setToasts((ts) => ts.filter((x) => x.id !== t.id));
                }}
                className="ml-1 rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-indigo-300 hover:bg-white/20"
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))}
              className="ml-2 text-slate-500 hover:text-slate-300"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
