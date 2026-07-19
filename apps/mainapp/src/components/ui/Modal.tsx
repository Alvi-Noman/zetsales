import type { ReactNode } from "react";
import { X } from "lucide-react";
import clsx from "clsx";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  widthClass?: string;
  bodyClassName?: string;
  children: ReactNode;
  // False for flows that must be completed, not dismissed (e.g. a required setup wizard) — hides
  // the X button and ignores backdrop clicks, so the only way out is whatever the content itself
  // provides (a "Finish" action that calls onClose once everything is actually filled in).
  dismissible?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  widthClass = "max-w-md",
  bodyClassName = "max-h-[70vh] overflow-y-auto px-6 py-5",
  children,
  dismissible = true,
}: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={dismissible ? onClose : undefined} />
      <div
        className={clsx(
          "relative w-full rounded-lg bg-white shadow-2xl",
          widthClass,
        )}
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
            )}
          </div>
          {dismissible && (
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div className={bodyClassName}>{children}</div>
      </div>
    </div>
  );
}
