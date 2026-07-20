import { AlertTriangle } from 'lucide-react';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex h-48 items-center justify-center gap-2 text-sm text-slate-500">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      {label}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
      <AlertTriangle size={20} className="text-red-400" />
      <p className="text-sm font-medium text-red-400">Couldn't load data</p>
      <p className="max-w-md text-xs text-slate-500">{message}</p>
    </div>
  );
}
