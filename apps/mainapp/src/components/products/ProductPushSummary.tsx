import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Globe,
  Package,
  ShoppingBag,
  Store as StoreIcon,
  XCircle,
} from "lucide-react";
import clsx from "clsx";
import type { ProductPushResultDTO } from "@zetsales/shared";

const PLATFORM_ICON = {
  shopify: ShoppingBag,
  woocommerce: StoreIcon,
  zetsite: Globe,
  csv: FileSpreadsheet,
} as const;

interface ProductPushSummaryProps {
  title: string;
  image?: string | null;
  results: ProductPushResultDTO[];
  action?: "push" | "delete";
}

export function ProductPushSummary({
  title,
  image,
  results,
  action = "push",
}: ProductPushSummaryProps) {
  const successCount = results.filter((r) => r.success).length;
  const allSucceeded = successCount === results.length;
  const allFailed = successCount === 0;

  const headline =
    action === "delete"
      ? allSucceeded
        ? `Deleted from ${successCount} store${successCount === 1 ? "" : "s"}`
        : allFailed
          ? "Could not delete this product"
          : `Deleted from ${successCount} of ${results.length} stores`
      : allSucceeded
        ? `Live on ${successCount} store${successCount === 1 ? "" : "s"}`
        : allFailed
          ? "Could not push this product"
          : `Live on ${successCount} of ${results.length} stores`;

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <div
          className={clsx(
            "flex h-14 w-14 animate-pop-in items-center justify-center rounded-full",
            allSucceeded
              ? "bg-emerald-50"
              : allFailed
                ? "bg-rose-50"
                : "bg-amber-50",
          )}
        >
          {allSucceeded ? (
            <CheckCircle2 size={28} className="text-emerald-600" />
          ) : allFailed ? (
            <XCircle size={28} className="text-rose-600" />
          ) : (
            <AlertTriangle size={28} className="text-amber-600" />
          )}
        </div>
        <div>
          <p className="text-base font-bold text-slate-900">{headline}</p>
          <div className="mt-1.5 flex items-center justify-center gap-2">
            {image ? (
              <img
                src={image}
                alt={title}
                className="h-5 w-5 rounded object-cover"
              />
            ) : (
              <Package size={14} className="text-slate-300" />
            )}
            <p className="text-sm text-slate-500">{title}</p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 zs-table-body">
        {results.map((r) => {
          const Icon = PLATFORM_ICON[r.platform];
          return (
            <div
              key={r.storeId}
              className="flex items-center gap-3 bg-white px-4 py-3"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <Icon size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">
                  {r.displayName}
                </p>
                {!r.success && (
                  <p className="truncate text-xs text-rose-600">{r.error}</p>
                )}
              </div>
              {r.success ? (
                <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
              ) : (
                <XCircle size={16} className="shrink-0 text-rose-500" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
