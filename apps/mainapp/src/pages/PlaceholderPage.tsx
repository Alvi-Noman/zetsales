import type { LucideIcon } from 'lucide-react';
import { Construction } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
}

export function PlaceholderPage({ title, description, icon: Icon = Construction }: PlaceholderPageProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-8 py-5">
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
      </div>
      <div className="flex flex-1 items-center justify-center px-8">
        <div className="flex max-w-sm flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-10 py-14 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50">
            <Icon size={26} className="text-indigo-500" />
          </div>
          <h2 className="text-base font-semibold text-slate-900">{title} module coming soon</h2>
          <p className="mt-1.5 text-sm text-slate-500">
            {description ?? `This is a placeholder for the ${title} workspace. It will be built out as part of the unified suite.`}
          </p>
        </div>
      </div>
    </div>
  );
}
