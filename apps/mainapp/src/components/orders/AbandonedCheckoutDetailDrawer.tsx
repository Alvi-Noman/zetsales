import { Check, Copy, Mail, MapPin, MessageCircle, MousePointerClick, Package, Phone, X } from "lucide-react";
import clsx from "clsx";
import { useState } from "react";
import type { AbandonedCheckoutDTO, StoreDTO } from "@zetsales/shared";
import { telLink, waLink } from "./contact";
import { avatarFromName } from "./avatar";

interface AbandonedCheckoutDetailDrawerProps {
  checkout: AbandonedCheckoutDTO | null;
  store: StoreDTO | null;
  onClose: () => void;
}

function formatFullDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

// Woo has no dedicated abandoned-cart event — an order that never got past pending/on-hold/failed/
// cancelled at creation time is the closest signal, so its `reason` is the raw Woo status. Shopify
// checkouts are the real thing and get one shared label — mirrors AbandonedCheckoutsPage.tsx.
function reasonLabel(reason: string) {
  if (reason === "checkout_abandoned") return "Abandoned";
  return reason.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

// Deliberately the same shell as OrderDetailDrawer (overlay, slide-in panel, section cards, avatar
// row, contact rows) so this reads as the same product, not a different one — but with no workflow
// sections (stage stepper, courier, claim, split, upsell) since a checkout that never became an
// order has none of that to act on.
export function AbandonedCheckoutDetailDrawer({ checkout, store, onClose }: AbandonedCheckoutDetailDrawerProps) {
  const [copied, setCopied] = useState(false);
  if (!checkout) return null;

  const avatar = avatarFromName(checkout.customerName);
  const itemsTotal = checkout.lineItems.reduce((sum, li) => sum + Number(li.price) * li.quantity, 0);

  const copyLink = () => {
    if (!checkout.checkoutUrl) return;
    navigator.clipboard.writeText(checkout.checkoutUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-slate-900/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-2xl animate-slide-in-right flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">#{checkout.externalId}</h2>
            <p className="text-xs text-slate-400">
              {store?.displayName ?? (checkout.platform === "shopify" ? "Shopify" : "WooCommerce")} · {formatFullDate(checkout.createdAt)}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
              {reasonLabel(checkout.reason)}
            </span>
            {checkout.checkoutUrl && (
              <button
                onClick={copyLink}
                className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-100"
              >
                {copied ? <Check size={11} /> : <MousePointerClick size={11} />}
                {copied ? "Link copied" : "Copy recovery link"}
              </button>
            )}
          </div>

          <section className="rounded-lg border border-slate-200 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Customer</h3>
            <div className="flex items-center gap-3">
              <div className={clsx("flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white", avatar.color)}>
                {avatar.initials}
              </div>
              <p className="text-sm font-semibold text-slate-800">{checkout.customerName || "No name"}</p>
            </div>
            <div className="mt-3 space-y-1.5 text-sm text-slate-600">
              {checkout.customerPhone && (
                <div className="flex items-center gap-2">
                  <Phone size={13} className="text-slate-400 shrink-0" />
                  {checkout.customerPhone}
                  <a href={telLink(checkout.customerPhone)} title="Call" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-600">
                    <Phone size={12} />
                  </a>
                  <a href={waLink(checkout.customerPhone)} target="_blank" rel="noreferrer" title="WhatsApp" className="rounded-md p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600">
                    <MessageCircle size={12} />
                  </a>
                </div>
              )}
              {checkout.customerEmail && (
                <div className="flex items-center gap-2">
                  <Mail size={13} className="text-slate-400 shrink-0" /> {checkout.customerEmail}
                </div>
              )}
              <div className="flex items-center gap-2">
                <MapPin size={13} className="text-slate-400 shrink-0" />
                <span>{checkout.address || "No address"}</span>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Items</h3>
            <div className="space-y-3">
              {checkout.lineItems.map((li, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg text-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-400">
                      {li.image ? <img src={li.image} alt="" className="h-full w-full object-cover" /> : <Package size={15} />}
                    </div>
                    <div>
                      <p className="font-medium text-slate-700">{li.title}</p>
                      <p className="text-xs text-slate-400">
                        {li.variant ? `${li.variant} · ` : ""}Qty {li.quantity}
                        {li.sku ? ` · ${li.sku}` : ""}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 font-medium tabular-nums text-slate-700">
                    {checkout.currency} {(Number(li.price) * li.quantity).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-sm font-semibold text-slate-800">
              <span>Items total</span>
              <span className="tabular-nums">
                {checkout.currency} {itemsTotal.toLocaleString()}
              </span>
            </div>
          </section>

          {checkout.checkoutUrl && (
            <section className="rounded-lg border border-slate-200 p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Recovery link</h3>
              <div className="flex items-center gap-2">
                <a href={checkout.checkoutUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm text-indigo-600 hover:underline">
                  {checkout.checkoutUrl}
                </a>
                <button onClick={copyLink} className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                  {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
