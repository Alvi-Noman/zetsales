import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Printer, Scissors, X, Package } from "lucide-react";
import type {
  InvoiceTemplateDTO,
  OrderDTO,
  OrderLineItemDTO,
  PrintPaperSize,
} from "@zetsales/shared";
import { useAuth } from "../../context/AuthContext";
import { ensureOrderInvoices, getBrandingSettings } from "../../lib/commerceApi";
import { useToast } from "../ui/ToastProvider";
import { formatAbsoluteDateTime } from "./time";
import { resolveBin, type BinLookup } from "./binLookup";
import { Barcode } from "./Barcode";
import { canPrintPackingSlip } from "./stageFlow";

export type PrintDocType = "invoice" | "packingSlip" | "combined";

// The 7 named invoice layouts offered by the "Invoice format" picker (PrintOutPage.tsx). Purely a
// client-side visual-style axis — orthogonal to InvoiceTemplateDTO's backend-persisted branding/
// toggle overrides below. Every trait combination mirrors INVOICE_FORMATS' own skeleton-preview
// logic exactly, so the picker's thumbnails stay a truthful spec of what actually renders.
export type InvoiceFormat =
  | "Classic"
  | "Modern"
  | "Minimal"
  | "Compact"
  | "Bold"
  | "Retail"
  | "Statement";

// Classic's filled table header is now the default appearance app-wide, not just within the
// Invoice Format picker's own preview/export flow — "Classic" is also what every caller that never
// passes invoiceStyle at all (Orders' bulk print, the order detail drawer) resolves to, so this
// changes what every real customer invoice looks like unless a different format is chosen.
function invoiceStyleTraits(style: InvoiceFormat) {
  const retailLike = style === "Retail" || style === "Statement";
  return {
    framed: style === "Classic" || style === "Bold" || style === "Statement",
    split: style === "Modern" || style === "Minimal",
    soft: style === "Minimal",
    dense: style === "Compact" || retailLike,
    logoRight: style === "Modern" || retailLike,
    barcodeTop: style === "Compact" || retailLike,
  };
}

interface PrintOrderModalProps {
  open: boolean;
  onClose: () => void;
  orders: OrderDTO[];
  docType: PrintDocType;
  binLookup?: BinLookup;
  // Branding/layout overrides from a saved template. Omitted or null means the original hardcoded
  // layout — every field below reads as "on"/default when template is
  // absent, so existing callers (Orders' bulk print, the order detail drawer) keep working exactly
  // as before without needing to fetch or pass anything.
  template?: InvoiceTemplateDTO | null;
  // Visual layout for the invoice half only (packing slips always render "Classic" regardless —
  // see PackingSlipBody). Omitted defaults to "Classic", today's exact original look.
  invoiceStyle?: InvoiceFormat;
  // Independent of template.paperSize (which only exists once a real saved template is wired up) —
  // lets the format picker's own A5/A4 choice reach the actual printed page size.
  paperSize?: PrintPaperSize;
}

const DOC_LABEL: Record<PrintDocType, string> = {
  invoice: "Invoice",
  packingSlip: "Packing Slip",
  combined: "Invoice + Slip",
};

// Letterhead-style header shared by both documents — a business's own name is the one thing that
// should read as the most important word on the page, so it's set larger than everything else,
// with the document type as a small stamp-like badge next to it rather than competing for space.
function DocHeader({
  businessName,
  label,
  order,
  compact,
  template,
  style,
  logoUrl,
}: {
  businessName: string;
  label: string;
  order: OrderDTO;
  compact?: boolean;
  template?: InvoiceTemplateDTO | null;
  style: InvoiceFormat;
  // A saved print template's own logo (if one's ever wired up) wins over the tenant's general
  // Settings/Branding logo — the template is a deliberate per-document override, branding is just
  // the fallback every document gets for free.
  logoUrl?: string | null;
}) {
  const { logoRight, soft } = invoiceStyleTraits(style);
  const displayName = template?.businessNameOverride || businessName;
  const primaryNo = order.invoiceNo ?? order.number;
  const effectiveLogoUrl = template?.logoUrl || logoUrl;

  const brandBlock = (
    <div className={clsx("flex items-center gap-2.5", logoRight && "flex-row-reverse")}>
      {effectiveLogoUrl ? (
        <img
          src={effectiveLogoUrl}
          alt={displayName}
          className={clsx(
            compact ? "h-14 w-14" : "h-24 w-24",
            "object-contain",
            style === "Bold" ? "rounded-none" : "rounded",
          )}
        />
      ) : (
        <h1
          className={
            compact
              ? "text-base font-bold tracking-tight text-slate-900"
              : "text-2xl font-bold tracking-tight text-slate-900"
          }
        >
          {displayName}
        </h1>
      )}
      <span
        className={clsx(
          "text-[10px] font-bold uppercase tracking-wider",
          soft
            ? "text-slate-400"
            : "rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-700",
        )}
      >
        {label}
      </span>
    </div>
  );

  const titleBlock = (
    <div className={clsx("text-sm", logoRight ? "text-left" : "text-right")}>
      <p className="font-semibold text-slate-900">{primaryNo}</p>
      {order.invoiceNo && (
        <p className="text-xs text-slate-400">Order {order.number}</p>
      )}
      <p className="text-slate-400">
        {compact
          ? order.customerName || "No name"
          : formatAbsoluteDateTime(order.createdAt)}
      </p>
    </div>
  );

  return (
    <div
      className={clsx(
        compact ? "mb-4" : "mb-6",
        "flex items-start justify-between",
        logoRight && "flex-row-reverse",
      )}
    >
      {brandBlock}
      {titleBlock}
    </div>
  );
}

// Split out of DocMeta so Retail can put the Customer/Payment grid beside its barcode instead of
// stacking everything full-width — every other format still just renders DocMeta, which composes
// these two pieces exactly as before.
function DocMetaGrid({
  order,
  template,
  dense,
}: {
  order: OrderDTO;
  template?: InvoiceTemplateDTO | null;
  dense: boolean;
}) {
  const showPayment = template?.showPaymentBox !== false;
  const showAddress = template?.showCustomerAddress !== false;
  const boxPad = dense ? "p-3" : "p-4";
  const boxFill = "rounded-lg bg-slate-50";
  return (
    <div className="grid grid-cols-2 gap-4 text-sm">
      <div className={clsx(boxFill, boxPad)}>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Customer
        </p>
        <p className="font-semibold text-slate-800">
          {order.customerName || "No name"}
        </p>
        {order.customerPhone && (
          <p className="text-slate-600">{order.customerPhone}</p>
        )}
        {showAddress && order.address && (
          <p className="text-slate-600">{order.address}</p>
        )}
      </div>
      {showPayment && (
        <div className={clsx(boxFill, boxPad)}>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Payment
          </p>
          <p className="font-semibold text-slate-800">{order.paymentMethod}</p>
          <p className="text-slate-600">{order.paymentStatus}</p>
        </div>
      )}
    </div>
  );
}

function DocMetaDelivery({
  order,
  template,
  dense,
}: {
  order: OrderDTO;
  template?: InvoiceTemplateDTO | null;
  dense: boolean;
}) {
  const showDelivery = template?.showDeliveryBox !== false;
  if (!showDelivery || !order.courierPartner) return null;
  const boxPad = dense ? "p-3" : "p-4";
  return (
    <div className={clsx("rounded-lg bg-slate-50", boxPad, "text-sm")}>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        Delivery
      </p>
      <p className="font-semibold text-slate-800">{order.courierPartner}</p>
      {order.courierTrackingId && (
        <p className="text-slate-600">Tracking: {order.courierTrackingId}</p>
      )}
    </div>
  );
}

function DocMeta({
  order,
  template,
  style,
}: {
  order: OrderDTO;
  template?: InvoiceTemplateDTO | null;
  style: InvoiceFormat;
}) {
  const { dense } = invoiceStyleTraits(style);
  return (
    <div className="mb-6 space-y-4">
      <DocMetaGrid order={order} template={template} dense={dense} />
      <DocMetaDelivery order={order} template={template} dense={dense} />
    </div>
  );
}

function ItemThumb({ item }: { item: OrderLineItemDTO }) {
  if (item.image) {
    return (
      <img
        src={item.image}
        alt=""
        className="h-12 w-12 shrink-0 rounded-lg border border-slate-100 object-cover"
      />
    );
  }
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50">
      <Package size={16} className="text-slate-300" />
    </div>
  );
}

// `mode="price"` for the invoice (customer-facing, what they paid); `mode="bin"` for the packing
// slip (warehouse-facing, where to physically find it) — same items, same table shape, only the
// third column changes, since those are the only two things each audience actually needs to know.
function ItemsTable({
  order,
  mode,
  binLookup,
  template,
  style,
}: {
  order: OrderDTO;
  mode: "price" | "bin";
  binLookup?: BinLookup;
  template?: InvoiceTemplateDTO | null;
  style: InvoiceFormat;
}) {
  const { framed, dense } = invoiceStyleTraits(style);
  const showImages = template?.showItemImages !== false;
  const showSkuVariant = template?.showSkuVariant !== false;
  const rowPad = dense ? "py-1.5" : "py-2.5";
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr
          className={clsx(
            "text-left text-[10px] font-bold uppercase tracking-wider",
            framed
              ? "bg-slate-800 text-white/80"
              : "border-b border-slate-200 text-slate-400",
          )}
        >
          <th className={clsx("pb-2", framed && "px-3 pt-2")}>Item</th>
          <th className={clsx("pb-2 text-center", framed && "px-3 pt-2")}>
            Qty
          </th>
          <th
            className={clsx(
              "pb-2",
              mode === "price" && "text-right",
              framed && "px-3 pt-2",
            )}
          >
            {mode === "price" ? "Price" : "Shelf/Bin"}
          </th>
        </tr>
      </thead>
      <tbody>
        {order.lineItems.map((li, i) => (
          <tr key={i} className="border-b border-slate-100 even:bg-slate-50/60">
            <td className={rowPad}>
              <div className="flex items-center gap-3">
                {showImages && <ItemThumb item={li} />}
                <div className="min-w-0">
                  <p className="font-medium text-slate-800">{li.title}</p>
                  {showSkuVariant && (
                    <p className="truncate text-xs text-slate-400">
                      {li.variant ? `${li.variant} · ` : ""}
                      {li.sku ?? "No SKU"}
                    </p>
                  )}
                </div>
              </div>
            </td>
            <td className={clsx(rowPad, "text-center tabular-nums text-slate-600")}>
              {li.quantity}
            </td>
            {mode === "price" ? (
              <td
                className={clsx(
                  rowPad,
                  "text-right tabular-nums font-medium text-slate-800",
                )}
              >
                {order.currency} {(li.price * li.quantity).toLocaleString()}
              </td>
            ) : (
              <td className={clsx(rowPad, "text-slate-600")}>
                {resolveBin(binLookup, li.sku, order.fulfillmentWarehouseId)}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Modern-only: two separately bordered boxes side by side (item details on the left, qty/price on
// the right) with a real gap between them, instead of one continuous table — what "split" means
// for the item table specifically (DocMeta's two info boxes already look like Classic's regardless
// of style; this is the one place Modern still visibly diverges from it).
// Modern-only: the exact same plain table look as Minimal/Retail (no outer border, no filled
// header, same row dividers/zebra striping) — the one difference is a bare spacer column between
// the item details and the qty/price columns, parting the table down the middle without adding
// any border or outside padding.
function SplitItemsTable({
  order,
  template,
  dense,
}: {
  order: OrderDTO;
  template?: InvoiceTemplateDTO | null;
  dense: boolean;
}) {
  const showImages = template?.showItemImages !== false;
  const showSkuVariant = template?.showSkuVariant !== false;
  const rowPad = dense ? "py-1.5" : "py-2.5";
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
          <th className="pb-2">Item</th>
          <th className="w-6" />
          <th className="pb-2 text-center">Qty</th>
          <th className="pb-2 text-right">Price</th>
        </tr>
      </thead>
      <tbody>
        {order.lineItems.map((li, i) => (
          <tr key={i} className="border-b border-slate-100 even:bg-slate-50/60">
            <td className={rowPad}>
              <div className="flex items-center gap-3">
                {showImages && <ItemThumb item={li} />}
                <div className="min-w-0">
                  <p className="font-medium text-slate-800">{li.title}</p>
                  {showSkuVariant && (
                    <p className="truncate text-xs text-slate-400">
                      {li.variant ? `${li.variant} · ` : ""}
                      {li.sku ?? "No SKU"}
                    </p>
                  )}
                </div>
              </div>
            </td>
            <td />
            <td className={clsx(rowPad, "text-center tabular-nums text-slate-600")}>
              {li.quantity}
            </td>
            <td
              className={clsx(
                rowPad,
                "text-right tabular-nums font-medium text-slate-800",
              )}
            >
              {order.currency} {(li.price * li.quantity).toLocaleString()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InvoiceTotals({ order }: { order: OrderDTO }) {
  return (
    <div className="mt-4 ml-auto w-64 space-y-1.5 text-sm">
      <div className="flex justify-between text-slate-500">
        <span>Subtotal</span>
        <span className="tabular-nums">
          {order.currency} {order.subtotal.toLocaleString()}
        </span>
      </div>
      <div className="flex justify-between text-slate-500">
        <span>Shipping</span>
        <span className="tabular-nums">
          {order.currency} {order.shippingFee.toLocaleString()}
        </span>
      </div>
      {order.discount > 0 && (
        <div className="flex justify-between text-slate-500">
          <span>Discount</span>
          <span className="tabular-nums">
            -{order.currency} {order.discount.toLocaleString()}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between rounded-lg bg-indigo-50 px-3 py-2 font-bold text-indigo-900">
        <span>Total</span>
        <span className="tabular-nums text-base">
          {order.currency} {order.total.toLocaleString()}
        </span>
      </div>
      {order.advanceAmount > 0 && (
        <>
          <div className="flex justify-between text-slate-500">
            <span>Advance paid</span>
            <span className="tabular-nums">
              -{order.currency} {order.advanceAmount.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 font-bold text-amber-900">
            <span>Balance due</span>
            <span className="tabular-nums text-base">
              {order.currency}{" "}
              {Math.max(0, order.total - order.advanceAmount).toLocaleString()}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function CodCallout({ order }: { order: OrderDTO }) {
  return (
    <div className="mt-4 ml-auto w-64 rounded-lg bg-amber-50 px-3 py-2 text-right text-sm font-semibold text-amber-800">
      Collect (COD): {order.currency}{" "}
      {Math.max(0, order.total - order.advanceAmount).toLocaleString()}
      {order.advanceAmount > 0 && (
        <p className="mt-0.5 text-[11px] font-medium text-amber-600">
          ({order.currency} {order.advanceAmount.toLocaleString()} advance
          already collected)
        </p>
      )}
    </div>
  );
}

// Every invoice carries a scannable barcode of its own order number — handy for a business that
// keeps its own paper trail (matching a returned invoice back to an order by scanner rather than
// squinting at a number), independent of whatever a courier's own tracking barcode says.
function InvoiceBarcode({
  order,
  template,
  top,
}: {
  order: OrderDTO;
  template?: InvoiceTemplateDTO | null;
  top?: boolean;
}) {
  const showBarcode = template?.showBarcode !== false;
  const barcodeValue = order.invoiceNo ?? order.number;
  return (
    <div
      className={clsx(
        "flex flex-col items-center border-dashed border-slate-200",
        top ? "mb-4 border-b pb-4" : "mt-6 border-t pt-4",
      )}
    >
      {showBarcode && (
        <>
          <div className="w-48">
            <Barcode value={barcodeValue} height={36} />
          </div>
          <p className="mt-1 text-center text-[11px] font-medium tracking-wider text-slate-500">
            {barcodeValue}
          </p>
        </>
      )}
      <p className="mt-2 text-center text-xs text-slate-400">
        {template?.footerNote || "Thank you for your order."}
      </p>
    </div>
  );
}

// Retail-only: the barcode graphic on its own, no footer note attached — it sits beside DocMeta at
// the top instead of anchoring the bottom of the page the way InvoiceBarcode does everywhere else.
function BarcodeGraphic({
  order,
  template,
  align,
}: {
  order: OrderDTO;
  template?: InvoiceTemplateDTO | null;
  align: "center" | "right";
}) {
  if (template?.showBarcode === false) return null;
  const barcodeValue = order.invoiceNo ?? order.number;
  return (
    <div
      className={clsx(
        "flex shrink-0 flex-col",
        align === "right" ? "items-end" : "items-center",
      )}
    >
      <div className="w-40">
        <Barcode value={barcodeValue} height={32} />
      </div>
      <p className="mt-1 text-center text-[11px] font-medium tracking-wider text-slate-500">
        {barcodeValue}
      </p>
    </div>
  );
}

// Retail-only: just the footer note, anchored to the very bottom of the page (after totals)
// instead of riding along with the barcode.
function FooterNote({ template }: { template?: InvoiceTemplateDTO | null }) {
  return (
    <p className="mt-6 border-t border-dashed border-slate-200 pt-4 text-center text-xs text-slate-400">
      {template?.footerNote || "Thank you for your order."}
    </p>
  );
}

function InvoiceBody({
  order,
  businessName,
  template,
  style,
  logoUrl,
}: {
  order: OrderDTO;
  businessName: string;
  template?: InvoiceTemplateDTO | null;
  style: InvoiceFormat;
  logoUrl?: string | null;
}) {
  const { barcodeTop, split, dense } = invoiceStyleTraits(style);
  const itemsTable = split ? (
    <SplitItemsTable order={order} template={template} dense={dense} />
  ) : (
    <ItemsTable order={order} mode="price" template={template} style={style} />
  );

  // Retail: barcode rides beside DocMeta's Customer/Payment grid at the top instead of anchoring
  // the bottom, and the footer note stands alone at the very bottom instead of tagging along with
  // the barcode — a distinct enough layout from the shared barcodeTop treatment (Compact/Statement)
  // that it's its own composition rather than another boolean on invoiceStyleTraits.
  if (style === "Retail") {
    return (
      <>
        <DocHeader
          businessName={businessName}
          label="Invoice"
          order={order}
          template={template}
          style={style}
          logoUrl={logoUrl}
        />
        <div className="mb-6 space-y-4">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <DocMetaGrid order={order} template={template} dense={dense} />
            </div>
            <BarcodeGraphic order={order} template={template} align="right" />
          </div>
          <DocMetaDelivery order={order} template={template} dense={dense} />
        </div>
        {itemsTable}
        <InvoiceTotals order={order} />
        <FooterNote template={template} />
      </>
    );
  }

  const content = (
    <>
      <DocHeader
        businessName={businessName}
        label="Invoice"
        order={order}
        template={template}
        style={style}
        logoUrl={logoUrl}
      />
      {barcodeTop && <InvoiceBarcode order={order} template={template} top />}
      <DocMeta order={order} template={template} style={style} />
      {itemsTable}
      <InvoiceTotals order={order} />
      {!barcodeTop && <InvoiceBarcode order={order} template={template} />}
    </>
  );
  if (style !== "Bold") return content;
  return (
    <div className="rounded-lg border-2 border-slate-900 p-3">{content}</div>
  );
}

function PackingSlipBody({
  order,
  businessName,
  binLookup,
  compact,
  template,
}: {
  order: OrderDTO;
  businessName: string;
  binLookup?: BinLookup;
  compact?: boolean;
  template?: InvoiceTemplateDTO | null;
}) {
  return (
    <>
      <DocHeader
        businessName={businessName}
        label="Packing Slip"
        order={order}
        compact={compact}
        template={template}
        style="Classic"
      />
      {!compact && (
        <DocMeta order={order} template={template} style="Classic" />
      )}
      <ItemsTable
        order={order}
        mode="bin"
        binLookup={binLookup}
        template={template}
        style="Classic"
      />
      {(order.paymentStatus === "COD Pending" ||
        order.paymentStatus === "Advance Paid") &&
        template?.showCodCallout !== false && <CodCallout order={order} />}
    </>
  );
}

// One order per printed page. An invoice shows prices (it's the customer-facing, money document);
// a packing slip shows bin locations instead (it's the warehouse-facing, "what to grab" document).
// Deliberately two different documents rather than one with a toggle, since they go to different
// physical destinations — the invoice rides inside the box, the packing slip stays on the floor.
export function DocumentPage({
  order,
  docType,
  binLookup,
  businessName,
  template,
  invoiceStyle,
  logoUrl,
}: {
  order: OrderDTO;
  docType: PrintDocType;
  binLookup?: BinLookup;
  businessName: string;
  template?: InvoiceTemplateDTO | null;
  invoiceStyle?: InvoiceFormat;
  logoUrl?: string | null;
}) {
  return (
    <div className="print-page-break border-b border-slate-200 bg-white p-8 text-slate-900 last:border-b-0">
      {docType === "invoice" ? (
        <InvoiceBody
          order={order}
          businessName={businessName}
          template={template}
          style={invoiceStyle ?? "Classic"}
          logoUrl={logoUrl}
        />
      ) : (
        <PackingSlipBody
          order={order}
          businessName={businessName}
          binLookup={binLookup}
          template={template}
        />
      )}
    </div>
  );
}

function CutLine({ note }: { note: string }) {
  return (
    <div className="my-6 flex items-center gap-3 text-slate-300">
      <div className="flex-1 border-t border-dashed border-slate-300" />
      <Scissors size={13} className="shrink-0 text-slate-400" />
      <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {note}
      </span>
      <div className="flex-1 border-t border-dashed border-slate-300" />
    </div>
  );
}

// One printed sheet, two halves, meant to be cut apart after printing: the top (customer-facing,
// shows prices) rides with the box, the bottom (warehouse-facing, shows bins) stays on the floor.
// Deliberately repeats the order number/customer name on both halves — once cut, each half is a
// standalone piece of paper and needs to be traceable back to the order on its own.
export function CombinedDocumentPage({
  order,
  binLookup,
  businessName,
  template,
  invoiceStyle,
  logoUrl,
}: {
  order: OrderDTO;
  binLookup?: BinLookup;
  businessName: string;
  template?: InvoiceTemplateDTO | null;
  invoiceStyle?: InvoiceFormat;
  logoUrl?: string | null;
}) {
  return (
    <div className="print-page-break border-b border-slate-200 bg-white p-8 text-slate-900 last:border-b-0">
      <InvoiceBody
        order={order}
        businessName={businessName}
        template={template}
        style={invoiceStyle ?? "Classic"}
        logoUrl={logoUrl}
      />
      <CutLine note="Cut here — packing slip below" />
      <PackingSlipBody
        order={order}
        businessName={businessName}
        binLookup={binLookup}
        compact
        template={template}
      />
    </div>
  );
}

// One order's items as a tight block within the shared list below — no header/DocMeta/full-page
// treatment, just enough to tell a packer where one order ends and the next begins. `break-inside:
// avoid` (inline, since Tailwind's break-inside utility isn't reliably in this build) keeps a single
// order's rows from splitting across a page boundary, without forcing a break between orders the
// way DocumentPage's `print-page-break` does — that's the whole point of this layout.
function CompactPackingListOrder({
  order,
  binLookup,
}: {
  order: OrderDTO;
  binLookup?: BinLookup;
}) {
  return (
    <div className="mb-4" style={{ breakInside: "avoid" }}>
      <div className="mb-1 flex items-center justify-between gap-3 border-b border-slate-300 pb-1">
        <span className="text-sm font-bold text-slate-900">
          {order.number}{" "}
          <span className="font-medium text-slate-500">
            — {order.customerName || "No name"}
          </span>
        </span>
        {(order.paymentStatus === "COD Pending" ||
          order.paymentStatus === "Advance Paid") && (
          <span className="shrink-0 text-xs font-semibold text-amber-700">
            COD: {order.currency}{" "}
            {Math.max(0, order.total - order.advanceAmount).toLocaleString()}
          </span>
        )}
      </div>
      <table className="w-full border-collapse text-xs">
        <tbody>
          {order.lineItems.map((li, i) => (
            <tr key={i} className="even:bg-slate-50/60">
              <td className="py-1 pl-3 pr-2 text-slate-700">
                {li.title}
                {li.variant ? (
                  <span className="text-slate-400"> · {li.variant}</span>
                ) : null}
              </td>
              <td className="w-16 py-1 px-2 text-center tabular-nums text-slate-600">
                x{li.quantity}
              </td>
              <td className="w-24 py-1 pr-1 text-right text-slate-500">
                {resolveBin(binLookup, li.sku, order.fulfillmentWarehouseId)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Bulk packing slips only — one continuous, densely-packed document (no page-per-order) so a batch
// of orders takes as few printed pages as possible, still grouped by order so a packer can tell
// which items belong in which box. A single-order packing slip keeps the full-page DocumentPage
// treatment instead; there's nothing to save paper on for just one order.
function CompactPackingListDocument({
  orders,
  binLookup,
  businessName,
}: {
  orders: OrderDTO[];
  binLookup?: BinLookup;
  businessName: string;
}) {
  return (
    <div className="bg-white p-8 text-slate-900">
      <div className="mb-5 flex items-start justify-between border-b border-slate-200 pb-3">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          {businessName}
        </h1>
        <div className="text-right text-xs text-slate-500">
          <p className="font-semibold text-slate-700">
            Packing list — {orders.length} order{orders.length === 1 ? "" : "s"}
          </p>
          <p>{formatAbsoluteDateTime(new Date().toISOString())}</p>
        </div>
      </div>
      {orders.map((order) => (
        <CompactPackingListOrder
          key={order.id}
          order={order}
          binLookup={binLookup}
        />
      ))}
    </div>
  );
}

export function PrintOrderModal({
  open,
  onClose,
  orders: liveOrders,
  docType,
  binLookup,
  template,
  invoiceStyle,
  paperSize,
}: PrintOrderModalProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [printing, setPrinting] = useState(false);
  const [issuingBills, setIssuingBills] = useState(false);
  const ensureKeyRef = useRef<string | null>(null);
  // The tenant's own Settings/Branding logo — same one shown at /settings/branding, not the
  // (currently always-null) per-template logo override. Fetched fresh each time the modal opens
  // so a logo uploaded moments ago shows up without needing a full page reload.
  const [brandingLogoUrl, setBrandingLogoUrl] = useState<string | null>(null);

  // Freezes the order list the instant this modal opens, instead of reading the live `orders`
  // prop on every render, so a print session looks the same from open to close regardless of
  // whatever else changes the underlying order list while it's sitting open.
  const wasOpenRef = useRef(false);
  const [orders, setOrders] = useState<OrderDTO[]>(liveOrders);
  useEffect(() => {
    if (open && !wasOpenRef.current) setOrders(liveOrders);
    if (!open) ensureKeyRef.current = null;
    wasOpenRef.current = open;
  }, [open, liveOrders]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getBrandingSettings()
      .then(({ branding }) => {
        if (!cancelled) setBrandingLogoUrl(branding.logoUrl);
      })
      .catch(() => {
        if (!cancelled) setBrandingLogoUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || (docType !== "invoice" && docType !== "combined")) return;
    const orderIds = liveOrders.map((order) => order.id);
    if (orderIds.length === 0) return;
    const key = `${docType}:${orderIds.join(",")}`;
    if (ensureKeyRef.current === key) return;
    ensureKeyRef.current = key;
    let cancelled = false;
    setIssuingBills(true);
    void ensureOrderInvoices(orderIds)
      .then(({ orders: issuedOrders }) => {
        if (cancelled) return;
        const byId = new Map(issuedOrders.map((order) => [order.id, order]));
        setOrders((previous) =>
          previous.map((order) => byId.get(order.id) ?? order),
        );
      })
      .catch(() => {
        if (!cancelled)
          toast.push("Could not load bill numbers for preview.", "info");
      })
      .finally(() => {
        if (!cancelled) setIssuingBills(false);
      });
    return () => {
      cancelled = true;
    };
  }, [docType, liveOrders, open, toast]);

  if (!open) return null;

  // Packing slips (and the combined sheet, which includes one) only make sense for orders that
  // have actually reached packing — see canPrintPackingSlip. Confirmed orders in the selection are
  // silently dropped from that document rather than shown with bins nobody has picked yet; callers
  // are expected to gate the "Packing slip"/"Invoice + Slip" entry points themselves so this is
  // rarely reached with anything to drop, but it stays a hard backstop either way.
  const printableOrders =
    docType === "invoice"
      ? orders
      : orders.filter((o) => canPrintPackingSlip(o.stage));

  const handlePrint = async () => {
    if (printableOrders.length === 0) return;
    setPrinting(true);
    try {
      const { orders: printedOrders } = await ensureOrderInvoices(
        printableOrders.map((o) => o.id),
      );
      const byId = new Map(printedOrders.map((order) => [order.id, order]));
      setOrders((previous) =>
        previous.map((order) => byId.get(order.id) ?? order),
      );
      setTimeout(() => window.print(), 0);
    } catch {
      toast.push("Could not issue bill numbers for printing.", "info");
    } finally {
      setPrinting(false);
    }
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 print:static print:block print:h-auto print:p-0">
        <div
          className="absolute inset-0 bg-slate-900/40 print:hidden"
          onClick={onClose}
        />
        <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl print:static print:block print:h-auto print:max-h-none print:w-full print:max-w-none print:overflow-visible print:rounded-none print:shadow-none">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 print:hidden">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {DOC_LABEL[docType]}
                {printableOrders.length > 1
                  ? `s (${printableOrders.length})`
                  : ""}
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {issuingBills
                  ? "Issuing bill number..."
                  : "Preview below, then print."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                disabled={
                  printableOrders.length === 0 || printing || issuingBills
                }
                className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Printer size={14} />{" "}
                {printing || issuingBills ? "Preparing..." : "Print"}
              </button>
              <button
                onClick={onClose}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          {(paperSize ?? template?.paperSize) && (
            <style>{`@media print { @page { size: ${paperSize ?? template?.paperSize}; } }`}</style>
          )}
          <div className="print-area overflow-y-auto bg-slate-50 print:overflow-visible print:bg-white">
            {printableOrders.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-400">
                None of the selected orders have reached packing yet.
              </p>
            ) : docType === "combined" ? (
              // One sheet per order, cut in half — same layout whether it's one order from the
              // drawer or several from a bulk selection, just repeated once per order.
              printableOrders.map((order) => (
                <CombinedDocumentPage
                  key={order.id}
                  order={order}
                  binLookup={binLookup}
                  businessName={user?.businessName || "Your Business"}
                  template={template}
                  invoiceStyle={invoiceStyle}
                  logoUrl={brandingLogoUrl}
                />
              ))
            ) : docType === "packingSlip" && printableOrders.length > 1 ? (
              <CompactPackingListDocument
                orders={printableOrders}
                binLookup={binLookup}
                businessName={user?.businessName || "Your Business"}
              />
            ) : (
              printableOrders.map((order) => (
                <DocumentPage
                  key={order.id}
                  order={order}
                  docType={docType}
                  binLookup={binLookup}
                  businessName={user?.businessName || "Your Business"}
                  template={template}
                  invoiceStyle={invoiceStyle}
                  logoUrl={brandingLogoUrl}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
