import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";
import { PageTitle } from "../components/layout/PageTitle";

interface PlaceholderPageProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
}

export function PlaceholderPage({
  title,
  description,
  icon: Icon = Construction,
}: PlaceholderPageProps) {
  return (
    <div className="zs-page">
      <div className="zs-page-header">
        <PageTitle>{title}</PageTitle>
      </div>
      <div className="zs-page-body flex items-center justify-center">
        <div className="zs-dashed-surface flex max-w-sm flex-col items-center px-10 py-14 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-50">
            <Icon size={26} className="text-indigo-500" />
          </div>
          <h2 className="text-base font-semibold text-slate-900">
            {title} module coming soon
          </h2>
          <p className="mt-1.5 text-sm text-slate-500">
            {description ??
              `This is a placeholder for the ${title} workspace. It will be built out as part of the unified suite.`}
          </p>
        </div>
      </div>
    </div>
  );
}
