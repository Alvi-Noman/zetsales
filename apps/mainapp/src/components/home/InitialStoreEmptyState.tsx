import {
  ArrowRight,
  CheckCircle2,
  Package,
  ShoppingBag,
  Store,
  Truck,
} from "lucide-react";
import { ShopifyLogo, WooCommerceLogo } from "../orders/platformLogos";

interface InitialStoreEmptyStateProps {
  businessName: string;
  hasStoreRecords: boolean;
  onConnectShopify: () => void;
  onConnectWooCommerce: () => void;
  onOpenIntegrations: () => void;
}

const nextSteps = [
  { label: "Connect store", detail: "Shopify or WooCommerce", icon: Store },
  { label: "Import catalog", detail: "Products and variants", icon: Package },
  { label: "Sync orders", detail: "Dashboard comes alive", icon: Truck },
];

export function InitialStoreEmptyState({
  businessName,
  hasStoreRecords,
  onConnectShopify,
  onConnectWooCommerce,
  onOpenIntegrations,
}: InitialStoreEmptyStateProps) {
  return (
    <div className="flex min-h-[calc(100vh-190px)] items-center justify-center">
      <section className="w-full max-w-4xl rounded-lg border border-slate-200 bg-white px-6 py-10 text-center shadow-sm sm:px-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-slate-50 ring-1 ring-slate-200">
          <ShoppingBag size={24} className="text-slate-700" />
        </div>

        <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
          {hasStoreRecords
            ? "Store disconnected"
            : businessName === "there"
              ? "New workspace"
              : businessName}
        </p>
        <h2 className="mx-auto mt-3 max-w-2xl text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
          {hasStoreRecords
            ? "Reconnect your store to continue."
            : "Connect your first store."}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
          ZetSales is ready. Once a store is connected, your products, orders,
          customers, and sales metrics will start syncing into the dashboard.
        </p>

        <div className="mx-auto mt-7 grid max-w-xl gap-3 sm:grid-cols-2">
          <button
            onClick={onConnectShopify}
            className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800"
          >
            <ShopifyLogo size={18} className="rounded-sm bg-white" />
            Connect Shopify
          </button>
          <button
            onClick={onConnectWooCommerce}
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50"
          >
            <WooCommerceLogo size={22} />
            Connect WooCommerce
          </button>
        </div>

        <button
          onClick={onOpenIntegrations}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900"
        >
          View all integrations <ArrowRight size={14} />
        </button>

        <div className="mx-auto mt-9 grid max-w-3xl gap-3 border-t border-slate-100 pt-6 sm:grid-cols-3">
          {nextSteps.map(({ label, detail, icon: Icon }, index) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3 text-left"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200">
                {index === 0 ? (
                  <CheckCircle2 size={15} className="text-emerald-600" />
                ) : (
                  <Icon size={15} />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-800">
                  {label}
                </span>
                <span className="block text-xs text-slate-500">{detail}</span>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
