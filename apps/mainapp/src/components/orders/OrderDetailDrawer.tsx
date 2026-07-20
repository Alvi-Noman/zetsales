import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  MapPin,
  Phone,
  Mail,
  Package,
  PackageX,
  Ban,
  Printer,
  Loader2,
  Copy,
  Check,
  PauseCircle,
  PlayCircle,
  Pencil,
  PhoneCall,
  PhoneOff,
  MoreVertical,
  UserX,
  UserCheck,
  FileText,
  ClipboardList,
  Tag,
  ChevronDown,
  Lock,
  Scissors,
  Banknote,
  Plus,
  Split,
  ShieldAlert,
} from "lucide-react";
import clsx from "clsx";
import type {
  CallOutcome,
  CourierSummaryDTO,
  CourierProvider,
  OrderDTO,
  OrderRiskDTO,
  OrderStage,
  StoreDTO,
} from "@zetsales/shared";
import {
  blockCustomer,
  claimOrder,
  createDeliveryZone,
  getOrder,
  getOrderFulfillmentStatus,
  getOrderInventorySnapshot,
  getProduct,
  heartbeatOrderClaim,
  listDeliveryZones,
  markPaymentCollected,
  releaseOrderClaim,
  removeOrderLineItem,
  splitOrder,
  unblockCustomer,
  updateOrder,
  upsellOrder,
  type DeliveryZoneDTO,
} from "../../lib/commerceApi";
import {
  STAGE_TONE,
  STAGE_ICON,
  STAGE_LABEL,
  PAYMENT_TONE,
  CLAIM_TONE,
} from "./orderTone";
import {
  ProductPicker,
  type PickedProduct,
} from "../adPerformance/ProductPicker";
import {
  STAGE_ORDER,
  NEXT_ACTION,
  SECONDARY_ACTIONS,
  canPrintPackingSlip,
} from "./stageFlow";
import {
  ALL_CANCEL_REASONS,
  CALL_OUTCOMES,
  canHold,
  canCancel,
  inferCancelReason,
  holdReasonsFor,
} from "./reasons";
import { ReasonNoteMenu } from "./ReasonNoteMenu";
import { RiskBadge } from "./RiskBadge";
import { PartialDeliverModal } from "./PartialDeliverModal";
import { PrintOrderModal, type PrintDocType } from "./PrintOrderModal";
import { CourierLabelModal } from "./CourierLabelModal";
import { buildBinLookup, type BinLookup } from "./binLookup";
import {
  buildStockLookup,
  isOrderMixedStock,
  resolveFreeStock,
  summarizeOrderStock,
  type StockLookup,
} from "./stockLookup";
import { Popover } from "../ui/Popover";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import { avatarFromName } from "./avatar";
import { useToast } from "../ui/ToastProvider";
import { useAuth } from "../../context/AuthContext";
import { AppBlock } from "../apps/AppBlock";

const PROVIDER_LABEL: Record<CourierProvider, "Steadfast" | "Pathao"> = {
  steadfast: "Steadfast",
  pathao: "Pathao",
};

interface OrderDetailDrawerProps {
  order: OrderDTO | null;
  store: StoreDTO | null;
  couriers: CourierSummaryDTO[];
  onClose: () => void;
  onUpdated: () => void;
}

function formatFullDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const TERMINAL_STAGES = [
  "Delivered",
  "Partial Delivered",
  "Returned",
  "Cancelled",
];
const CALL_LOCK_STAGES: OrderStage[] = ["Pending", "Flagged", "On Hold"];
// Matches LINE_ITEM_EDITABLE_STAGES server-side (ordersController.ts) — editable while the order
// still physically lives in the warehouse, before or after confirmation, but not once it's shipped
// and its contents are physically fixed.
const LINE_ITEM_EDITABLE_STAGES: OrderStage[] = [
  "Pending",
  "Flagged",
  "Confirmed",
  "Processing",
  "Ready for Pickup",
];
const PRIORITY_ELIGIBLE_STAGES: OrderStage[] = [
  "Pending",
  "Flagged",
  "On Hold",
  "Confirmed",
];

function shouldUseCallLock(
  order: Pick<OrderDTO, "stage" | "isPriorityCall">,
): boolean {
  return (
    CALL_LOCK_STAGES.includes(order.stage) ||
    (order.isPriorityCall && !TERMINAL_STAGES.includes(order.stage))
  );
}

function canMarkPriorityCall(stage: OrderStage): boolean {
  return PRIORITY_ELIGIBLE_STAGES.includes(stage);
}

// Comfortably under the server's 60s claim TTL (see CLAIM_STALE_MS in claim.ts) so a couple of
// slow/dropped beats don't bounce the claim to someone else while this tab is still active.
const HEARTBEAT_INTERVAL_MS = 20_000;

// Stages an order only reaches once it's been marked ready and the courier consignment should
// exist. Used to decide whether a missing tracking code is actually a problem yet — an order can
// have a courier partner picked early (Processing) with no code, and that's normal; the same gap
// once the order is Ready for Pickup means either auto-dispatch failed or this courier isn't
// API-connected and staff need to key it in by hand.
const SHIPPED_OR_LATER: OrderStage[] = [
  "Ready for Pickup",
  "Shipped",
  "Out for Delivery",
  "Delivered",
  "Partial Delivered",
  "RTO Initiated",
  "QC Pending",
  "Returned",
];

function StageStepper({ order }: { order: OrderDTO }) {
  const exception = [
    "Returned",
    "Partial Delivered",
    "Cancelled",
    "On Hold",
    "Flagged",
    "RTO Initiated",
    "QC Pending",
  ].includes(order.stage);
  const activeIndex = (() => {
    if (order.stage === "Flagged" || order.stage === "Cancelled") return 0;
    if (order.stage === "On Hold")
      return order.heldFromStage
        ? Math.max(0, STAGE_ORDER.indexOf(order.heldFromStage))
        : 0;
    if (
      ["Returned", "Partial Delivered", "RTO Initiated", "QC Pending"].includes(
        order.stage,
      )
    )
      return STAGE_ORDER.indexOf("Out for Delivery");
    return STAGE_ORDER.indexOf(order.stage);
  })();

  const banner = (() => {
    switch (order.stage) {
      case "Flagged":
        return {
          tone: "rose",
          text: `Flagged for review: ${order.flagReason ?? "Manual review requested"}`,
        };
      case "On Hold":
        return {
          tone: "orange",
          text: `On hold: ${[order.holdReason ?? "Manual review", order.note].filter(Boolean).join(" — ")}`,
        };
      case "Cancelled":
        return {
          tone: "slate",
          text: `Cancelled: ${[order.cancelReason ?? "Cancelled by staff", order.note].filter(Boolean).join(" — ")}`,
        };
      case "RTO Initiated":
        return {
          tone: "orange",
          text: "Delivery failed — the courier is bringing this order back to the warehouse. Stock stays held until it arrives.",
        };
      case "QC Pending":
        return {
          tone: "amber",
          text: "Package is back at the warehouse, awaiting a quality check before it goes back into stock.",
        };
      case "Returned":
        return {
          tone: "rose",
          text: "This order was returned to the warehouse.",
        };
      case "Partial Delivered":
        return {
          tone: "amber",
          text: "Only part of this order was delivered — the rest was returned.",
        };
      default:
        return null;
    }
  })();

  return (
    <div>
      <div className="flex items-center">
        {STAGE_ORDER.map((stage, i) => {
          const done = i <= activeIndex && order.stage !== "Flagged";
          return (
            <div
              key={stage}
              className="flex flex-1 items-center last:flex-none"
            >
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={clsx(
                    "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold",
                    done
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-400",
                  )}
                >
                  {i + 1}
                </div>
                <span
                  className={clsx(
                    "max-w-[64px] text-center text-[10px] leading-tight",
                    done ? "text-slate-700 font-medium" : "text-slate-400",
                  )}
                >
                  {STAGE_LABEL[stage]}
                </span>
              </div>
              {i < STAGE_ORDER.length - 1 && (
                <div
                  className={clsx(
                    "mx-1 h-0.5 flex-1",
                    i < activeIndex && !exception
                      ? "bg-indigo-600"
                      : i < activeIndex
                        ? "bg-slate-300"
                        : "bg-slate-100",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
      {banner && (
        <div
          className={clsx("mt-3 rounded-lg px-3 py-2 text-xs font-medium", {
            "bg-rose-50 text-rose-700": banner.tone === "rose",
            "bg-orange-50 text-orange-700": banner.tone === "orange",
            "bg-slate-100 text-slate-600": banner.tone === "slate",
            "bg-amber-50 text-amber-700": banner.tone === "amber",
          })}
        >
          {banner.text}
        </div>
      )}
    </div>
  );
}

export function OrderDetailDrawer({
  order,
  store,
  couriers,
  onClose,
  onUpdated,
}: OrderDetailDrawerProps) {
  const toast = useToast();
  const { user } = useAuth();
  // Both the auto-flagging behavior AND the risk/duplicate-detection display below are Fraud
  // Checker's UI now — folded together per the user's own call, rather than leaving risk display
  // as an always-on core feature separate from the plugin that acts on it.
  const fraudCheckerInstalled = Boolean(
    user?.installedPlugins?.includes("fraudChecker"),
  );
  const [detail, setDetail] = useState<OrderDTO | null>(null);
  const [risk, setRisk] = useState<OrderRiskDTO | null>(null);
  // True only when riskScope=courier's check genuinely failed/is on cooldown — kept distinct from
  // `risk` showing a real "New Customer" result, since those look identical otherwise.
  const [courierUnavailable, setCourierUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkingRisk, setCheckingRisk] = useState(false);
  // 'courier' (default) is Steadfast's own dashboard fraud-check data for this phone number;
  // 'network' pools order outcomes across every tenant on ZetSales; 'store' narrows to this
  // tenant's own history.
  const [riskScope, setRiskScope] = useState<"network" | "store" | "courier">(
    "courier",
  );
  const [copied, setCopied] = useState(false);
  const [partialModalOpen, setPartialModalOpen] = useState(false);
  const [priorityModalOpen, setPriorityModalOpen] = useState(false);
  const [priorityNoteInput, setPriorityNoteInput] = useState("");
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blockNoteInput, setBlockNoteInput] = useState("");
  const [editingShipping, setEditingShipping] = useState(false);
  const [shippingInput, setShippingInput] = useState("");
  const [editingDiscount, setEditingDiscount] = useState(false);
  const [discountInput, setDiscountInput] = useState("");
  const [editingAdvance, setEditingAdvance] = useState(false);
  const [advanceInput, setAdvanceInput] = useState("");
  const [trackingInput, setTrackingInput] = useState("");
  const [zones, setZones] = useState<DeliveryZoneDTO[]>([]);
  const [addingZone, setAddingZone] = useState(false);
  const [newZoneName, setNewZoneName] = useState("");
  const [printDocType, setPrintDocType] = useState<PrintDocType | null>(null);
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [confirmShipNoCourier, setConfirmShipNoCourier] = useState(false);
  // Set only when *another* agent currently holds the claim — never for the viewer's own claim, so
  // this alone can gate the "someone else is on this" banner and disable the calling actions.
  const [lockedByOther, setLockedByOther] = useState<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [editingAltPhone, setEditingAltPhone] = useState(false);
  const [altPhoneInput, setAltPhoneInput] = useState("");
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressInput, setAddressInput] = useState("");
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [upsellPicked, setUpsellPicked] = useState<PickedProduct | null>(null);
  const [upsellVariants, setUpsellVariants] = useState<
    { id: string; label: string; price: number }[]
  >([]);
  const [upsellVariantId, setUpsellVariantId] = useState("");
  const [upsellQuantity, setUpsellQuantity] = useState("1");
  const [upsellLoadingVariants, setUpsellLoadingVariants] = useState(false);
  const [upsellSubmitting, setUpsellSubmitting] = useState(false);
  const [removingItemIndex, setRemovingItemIndex] = useState<number | null>(
    null,
  );
  const [binLookup, setBinLookup] = useState<BinLookup | undefined>(undefined);
  const [stockLookup, setStockLookup] = useState<StockLookup | undefined>(
    undefined,
  );
  // null means "unknown" (not yet loaded, or the check failed) — treated as not-blocking, same
  // fail-open posture as binLookup/stockLookup above. The server's own hard gate on the actual PATCH
  // is the real enforcement; this is only what lets the button explain itself before someone clicks.
  const [fulfillmentStatus, setFulfillmentStatus] = useState<{
    ready: boolean;
    reason: string | null;
  } | null>(null);

  // Bin + free-stock lookup, from one shared fetch — bin numbers back the packing slip (resolved
  // per-order against `fulfillmentWarehouseId`, see binLookup.ts for why that has to be
  // warehouse-aware), and free stock backs the per-line-item stock display in
  // the Items section below, so staff can see at a glance whether what was just confirmed is
  // actually still in the building.
  const loadInventorySnapshot = async (orderId: string) => {
    try {
      const { levels } = await getOrderInventorySnapshot(orderId);
      setBinLookup(buildBinLookup(levels));
      setStockLookup(buildStockLookup(levels));
    } catch {
      // Both are supplementary context on top of the order itself; staff can still work without them.
    }
  };

  // The zone list is tenant-wide, not per-order, but reloading it whenever the drawer opens is
  // cheap and means a zone added from another order shows up immediately without extra plumbing.
  const loadZones = async () => {
    try {
      const res = await listDeliveryZones();
      setZones(res.zones);
    } catch {
      // Non-critical: the picker just shows an empty list, and adding a new zone still works.
    }
  };

  const refresh = async (
    id: string,
    {
      silent,
      scope,
      forceRecheck,
    }: {
      silent?: boolean;
      scope?: "network" | "store" | "courier";
      forceRecheck?: boolean;
    } = {},
  ) => {
    if (!silent) setLoading(true);
    try {
      const [res, fulfillment] = await Promise.all([
        getOrder(id, scope ?? "courier", forceRecheck),
        getOrderFulfillmentStatus(id).catch(() => null),
      ]);
      setDetail(res.order);
      setRisk(res.risk);
      setCourierUnavailable(res.courierUnavailable);
      setTrackingInput(res.order.courierTrackingId ?? "");
      setFulfillmentStatus(
        fulfillment
          ? { ready: fulfillment.ready, reason: fulfillment.reason }
          : null,
      );
    } catch {
      toast.push("Could not load order details.", "info");
    } finally {
      setLoading(false);
    }
  };

  const handleRiskScopeChange = (scope: "network" | "store" | "courier") => {
    setRiskScope(scope);
    if (order) {
      void refresh(order.id, { silent: true, scope });
    }
  };

  useEffect(() => {
    setRiskScope("courier");
    setCourierUnavailable(false);
    if (order) {
      setBinLookup(undefined);
      setStockLookup(undefined);
      void refresh(order.id);
      void loadInventorySnapshot(order.id);
      void loadZones();
    } else {
      setDetail(null);
      setBinLookup(undefined);
      setStockLookup(undefined);
    }
    setAddingZone(false);
    setNewZoneName("");

    // Claim call-related orders only. This prevents two agents from dialing the same customer
    // while leaving packing/dispatch/after-sales review free to inspect orders without taking a
    // call lock.
    const orderId = order?.id;
    const shouldClaim = Boolean(order && shouldUseCallLock(order));
    setLockedByOther(null);
    if (orderId && shouldClaim) {
      void claimOrder(orderId)
        .then(() => {
          heartbeatRef.current = setInterval(() => {
            void heartbeatOrderClaim(orderId).catch(() => {
              if (heartbeatRef.current) {
                clearInterval(heartbeatRef.current);
                heartbeatRef.current = null;
              }
            });
          }, HEARTBEAT_INTERVAL_MS);
        })
        .catch((err) => {
          setLockedByOther(
            err instanceof Error
              ? err.message
              : "This order is currently locked.",
          );
        });
    }

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      if (orderId && shouldClaim)
        void releaseOrderClaim(orderId).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.stage, order?.isPriorityCall]);

  const holdReasons = useMemo(
    () => holdReasonsFor(detail?.stage ?? "Pending"),
    [detail?.stage],
  );

  // A stage change means the call this claim was protecting is resolved — release it immediately
  // rather than waiting for the drawer to close, so the order isn't needlessly locked if staff keep
  // it open to review after acting.
  const releaseClaim = async () => {
    if (!order) return;
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    await releaseOrderClaim(order.id).catch(() => {});
  };

  const apply = async (payload: Parameters<typeof updateOrder>[1]) => {
    if (!order) return;
    try {
      await updateOrder(order.id, payload);
      await refresh(order.id, { silent: true });
      onUpdated();
      if (payload.stage) void releaseClaim();
    } catch (err) {
      toast.push(
        err instanceof Error ? err.message : "Could not update this order.",
        "info",
      );
    }
  };

  const [splitBusy, setSplitBusy] = useState(false);
  // Splitting is optional, not required — a plain Confirm on a mixed-stock order still behaves
  // exactly like it always has (reserves everything, oversell policy decides Confirmed vs
  // Flagged). This checkbox just repurposes the same primary action button when staff choose to
  // confirm the in-stock items now and move the rest into a separate order instead. Resets
  // whenever a different order is opened so a stale check doesn't silently split the wrong order.
  const [splitChecked, setSplitChecked] = useState(false);
  useEffect(() => {
    setSplitChecked(false);
  }, [order?.id]);
  const handleSplit = async () => {
    if (!order) return;
    setSplitBusy(true);
    try {
      const res = await splitOrder(order.id);
      await refresh(order.id, { silent: true });
      onUpdated();
      toast.push(
        `Confirmed — ${res.created.lineItems.length} item${res.created.lineItems.length === 1 ? "" : "s"} moved to a separate order #${res.created.number}.`,
        "success",
      );
    } catch (err) {
      toast.push(
        err instanceof Error ? err.message : "Could not split this order.",
        "info",
      );
    } finally {
      setSplitBusy(false);
    }
  };

  // Exactly one connected courier and nothing assigned yet -> assign it automatically, removing a
  // redundant click for the common single-courier seller. Never guesses between two-plus couriers
  // (stays Unassigned so a human picks deliberately), and only fires once per order view — keyed by
  // order id — so manually clearing it back to Unassigned afterward isn't immediately undone.
  const autoAssignedOrderIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!detail || detail.courierPartner != null || couriers.length !== 1)
      return;
    if (autoAssignedOrderIdRef.current === detail.id) return;
    autoAssignedOrderIdRef.current = detail.id;
    void apply({ courierPartner: PROVIDER_LABEL[couriers[0].provider] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.id, detail?.courierPartner, couriers]);

  if (!order) return null;
  const callLockApplies = detail ? shouldUseCallLock(detail) : false;
  const priorityActionAvailable = Boolean(
    detail && (detail.isPriorityCall || canMarkPriorityCall(detail.stage)),
  );

  // Deliberate hand-back (wrong number, escalating to a supervisor) — closes the drawer since
  // staying open without holding the claim would leave the buttons enabled for a call this agent
  // just said they're not making.
  const handleReleaseClaim = async () => {
    await releaseClaim();
    toast.push(
      "Released — back in the queue for anyone to pick up.",
      "success",
    );
    onUpdated();
    onClose();
  };

  const toggleBlock = async (next: boolean, note: string | null) => {
    try {
      if (next) await blockCustomer(order.id, note);
      else await unblockCustomer(order.id);
      await refresh(order.id, { silent: true });
      onUpdated();
      toast.push(
        next
          ? "Customer blocked — their future orders will be auto-cancelled."
          : "Customer unblocked.",
        "success",
      );
    } catch {
      toast.push("Could not update block status.", "info");
    }
  };

  const handleMarkCollected = async () => {
    try {
      await markPaymentCollected(order.id);
      await refresh(order.id, { silent: true });
      onUpdated();
      toast.push("Marked as collected.", "success");
    } catch (err) {
      toast.push(
        err instanceof Error
          ? err.message
          : "Could not mark this as collected.",
        "info",
      );
    }
  };

  const handleRecheckRisk = async () => {
    setCheckingRisk(true);
    await refresh(order.id, {
      silent: true,
      scope: riskScope,
      forceRecheck: true,
    });
    setCheckingRisk(false);
  };

  const copyTracking = () => {
    if (!detail?.courierTrackingId) return;
    navigator.clipboard.writeText(detail.courierTrackingId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const saveNewZone = async () => {
    const name = newZoneName.trim();
    if (!name) {
      setAddingZone(false);
      return;
    }
    try {
      const res = await createDeliveryZone(name);
      setZones((prev) =>
        prev.some((z) => z.id === res.zone.id)
          ? prev
          : [...prev, res.zone].sort((a, b) => a.name.localeCompare(b.name)),
      );
      await apply({ deliveryZone: res.zone.name });
    } catch {
      toast.push("Could not save that zone.", "info");
    }
    setAddingZone(false);
    setNewZoneName("");
  };

  const saveShippingFee = () => {
    const parsed = Number(shippingInput);
    if (Number.isFinite(parsed) && parsed >= 0)
      void apply({ shippingFee: parsed });
    setEditingShipping(false);
  };

  const saveDiscount = () => {
    const parsed = Number(discountInput);
    if (Number.isFinite(parsed) && parsed >= 0)
      void apply({ discount: parsed });
    setEditingDiscount(false);
  };

  const saveAdvance = () => {
    const parsed = Number(advanceInput);
    if (Number.isFinite(parsed) && parsed >= 0)
      void apply({ advanceAmount: parsed });
    setEditingAdvance(false);
  };

  const saveName = () => {
    const trimmed = nameInput.trim();
    if (trimmed) void apply({ customerName: trimmed });
    setEditingName(false);
  };

  const savePhone = () => {
    const trimmed = phoneInput.trim();
    if (trimmed) void apply({ customerPhone: trimmed });
    setEditingPhone(false);
  };

  const saveAltPhone = () => {
    void apply({ customerAltPhone: altPhoneInput.trim() || null });
    setEditingAltPhone(false);
  };

  const saveAddress = () => {
    void apply({ address: addressInput.trim() || null });
    setEditingAddress(false);
  };

  // Reset to a blank picker every time the modal opens rather than carrying over the last pick —
  // an upsell is a one-off add per call, not something staff would want to repeat by accident.
  const openAddProduct = () => {
    setUpsellPicked(null);
    setUpsellVariants([]);
    setUpsellVariantId("");
    setUpsellQuantity("1");
    setAddProductOpen(true);
  };

  const handlePickUpsellProduct = async (picked: PickedProduct) => {
    setUpsellPicked(picked);
    setUpsellVariants([]);
    setUpsellVariantId("");
    setUpsellLoadingVariants(true);
    try {
      const res = await getProduct(picked.id);
      const variants = res.product.variants.map((v) => ({
        id: v.id,
        label:
          [v.title, v.optionValues.join(" / ")].filter(Boolean).join(" — ") ||
          "Default",
        price: v.price,
      }));
      setUpsellVariants(variants);
      setUpsellVariantId(variants[0]?.id ?? "");
    } catch {
      toast.push("Could not load this product.", "info");
    } finally {
      setUpsellLoadingVariants(false);
    }
  };

  const submitUpsell = async () => {
    if (!order || !upsellPicked || !upsellVariantId) return;
    const quantity = Number(upsellQuantity);
    if (!Number.isFinite(quantity) || quantity < 1) return;
    setUpsellSubmitting(true);
    try {
      await upsellOrder(order.id, {
        productId: upsellPicked.id,
        variantId: upsellVariantId,
        quantity,
      });
      await refresh(order.id, { silent: true });
      onUpdated();
      toast.push("Product added.", "success");
      setAddProductOpen(false);
    } catch (err) {
      toast.push(
        err instanceof Error ? err.message : "Could not add this product.",
        "info",
      );
    } finally {
      setUpsellSubmitting(false);
    }
  };

  const removeLineItem = async (index: number) => {
    if (!order) return;
    setRemovingItemIndex(index);
    try {
      await removeOrderLineItem(order.id, index);
      await refresh(order.id, { silent: true });
      onUpdated();
      toast.push("Item removed.", "success");
    } catch (err) {
      toast.push(
        err instanceof Error ? err.message : "Could not remove this item.",
        "info",
      );
    } finally {
      setRemovingItemIndex(null);
    }
  };

  const avatar = detail ? avatarFromName(detail.customerName) : null;
  const feeLocked = detail ? TERMINAL_STAGES.includes(detail.stage) : false;
  // Once a real consignment exists, the courier already has the parcel — changing "Partner" at that
  // point wouldn't cancel or re-route anything, it would just make the order say one courier while
  // the physical package (and its tracking/consignment id) belongs to another. Lock on dispatch, not
  // on stage, since an order can sit in Ready for Pickup without ever actually having dispatched (see
  // the "Ship anyway" no-courier path) and that case should still be freely editable.
  const courierLocked = detail ? Boolean(detail.courierConsignmentId) : false;
  // No consignment id means auto-dispatch never ran (courier not API-connected, or it soft-failed
  // server-side) — once the parcel is actually shipped, that's the signal staff need to type in
  // whatever tracking code the courier's own portal/app gave them at booking.
  const needsTrackingCode = detail
    ? Boolean(detail.courierPartner) &&
      !detail.courierTrackingId &&
      !detail.courierConsignmentId &&
      SHIPPED_OR_LATER.includes(detail.stage)
    : false;
  const primaryAction = detail ? NEXT_ACTION[detail.stage] : undefined;
  const secondaryActions = detail
    ? (SECONDARY_ACTIONS[detail.stage] ?? [])
    : [];
  // A mixed-stock order (some line items in stock, some not) can still be confirmed normally — this
  // only controls whether the optional "Split this order" checkbox shows up next to the primary
  // action button, while the order is still pre-confirmation.
  const isMixedOrder =
    Boolean(detail) &&
    (detail!.stage === "Pending" || detail!.stage === "Flagged") &&
    isOrderMixedStock(detail!.lineItems, stockLookup);
  // At least one line item short — whether that's every item (fully short) or just some of them
  // left unsplit, confirming this as one order isn't "reserve stock," it's "go ahead without
  // stock" for the whole thing at once (see applyOutOfStockPolicy server-side: any shortfall at
  // all stamps the *entire* order wasShortOfStock, not just the short line). The button says so up
  // front instead of only surfacing that fact afterward via the "Restocked" badge.
  const hasShortItem =
    Boolean(detail) &&
    (detail!.stage === "Pending" || detail!.stage === "Flagged") &&
    summarizeOrderStock(detail!.lineItems, stockLookup).shortCount > 0;
  // The only two manual actions that actually require physical stock to be on hand — "Process
  // order" (about to start picking) and "Mark ready for pickup" (about to finish picking what's
  // being handed off). Every other stage's forward action (confirming, marking delivered, etc.)
  // isn't gated by this at all.
  const fulfillmentBlocked =
    Boolean(detail) &&
    (detail!.stage === "Confirmed" || detail!.stage === "Processing") &&
    fulfillmentStatus != null &&
    !fulfillmentStatus.ready;
  const courierRequiredForNextStep =
    (detail?.stage === "Processing" || detail?.stage === "Ready for Pickup") &&
    !detail.courierPartner;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 animate-fade-in bg-slate-900/40"
        onClick={onClose}
      />
      <div className="relative flex h-full w-full max-w-2xl animate-slide-in-right flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{order.number}</h2>
            <p className="text-xs text-slate-400">
              {store?.displayName ?? "Unknown store"}{" "}
              {detail && `· ${formatFullDate(detail.createdAt)}`}
            </p>
            {detail?.splitFromOrderNumber && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-amber-700">
                <Split size={11} /> Split from #{detail.splitFromOrderNumber}
              </p>
            )}
            {detail?.splitIntoOrderNumber && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-amber-700">
                <Split size={11} /> Split into #{detail.splitIntoOrderNumber}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        {lockedByOther && callLockApplies && (
          <div
            className={clsx(
              "mx-6 mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ring-1 ring-inset",
              CLAIM_TONE,
            )}
          >
            <Lock size={13} className="shrink-0" />
            <span className="flex-1">
              {lockedByOther} You can view this order, but can't log a call or
              change its stage until it's released.
            </span>
          </div>
        )}

        {!lockedByOther && !loading && detail && callLockApplies && (
          <div className="mx-6 mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <Lock size={12} /> You're calling this customer.
            </span>
            <button
              onClick={handleReleaseClaim}
              className="font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Release
            </button>
          </div>
        )}

        {loading || !detail ? (
          <div className="flex-1 py-16 text-center text-sm text-slate-400">
            Loading...
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              <section className="rounded-lg border border-slate-200 p-4">
                <StageStepper order={detail} />
              </section>

              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  {detail.paymentMethod}
                </span>
                <span
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                    STAGE_TONE[detail.stage],
                  )}
                >
                  {(() => {
                    const Icon = STAGE_ICON[detail.stage];
                    return <Icon size={11} />;
                  })()}
                  {STAGE_LABEL[detail.stage]}
                </span>
                <span
                  className={clsx(
                    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                    PAYMENT_TONE[detail.paymentStatus],
                  )}
                >
                  {detail.paymentStatus}
                </span>
                {detail.isPriorityCall && (
                  <span
                    title={detail.priorityNote ?? undefined}
                    className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 ring-1 ring-inset ring-orange-600/20"
                  >
                    <PhoneCall size={11} /> Priority call
                    {detail.priorityNote ? `: ${detail.priorityNote}` : ""}
                  </span>
                )}
                {detail.isCustomerBlocked && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">
                    <UserX size={11} /> Blocked customer
                  </span>
                )}
                {detail.customerPhone && (
                  <span
                    className={clsx(
                      "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                      detail.isReturningCustomer
                        ? "bg-blue-50 text-blue-700 ring-blue-600/20"
                        : "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
                    )}
                  >
                    {detail.isReturningCustomer
                      ? "Returning customer"
                      : "New customer"}
                  </span>
                )}
                {fraudCheckerInstalled && detail.riskLabel && (
                  <span
                    className={clsx(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                      detail.riskLabel === "Trusted"
                        ? "bg-violet-50 text-violet-700 ring-violet-600/20"
                        : detail.riskLabel === "Risky"
                          ? "bg-rose-50 text-rose-700 ring-rose-600/20"
                          : "bg-slate-100 text-slate-600 ring-slate-500/10",
                    )}
                  >
                    <ShieldAlert size={11} /> {detail.riskLabel}{" "}
                    {detail.riskSuccessRate}%
                  </span>
                )}
                {detail.tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10"
                  >
                    {t}
                  </span>
                ))}
              </div>

              <section className="rounded-lg border border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {fraudCheckerInstalled
                      ? "Customer & delivery risk"
                      : "Customer"}
                  </h3>
                  {fraudCheckerInstalled && (
                    <button
                      onClick={handleRecheckRisk}
                      disabled={checkingRisk}
                      className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                    >
                      {checkingRisk ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Loader2 size={12} className="opacity-0" />
                      )}
                      {checkingRisk ? "Checking..." : "Recheck risk"}
                    </button>
                  )}
                </div>
                {fraudCheckerInstalled && (
                  <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1">
                    {(["courier", "network", "store"] as const).map((scope) => (
                      <button
                        key={scope}
                        onClick={() => handleRiskScopeChange(scope)}
                        className={clsx(
                          "flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors",
                          riskScope === scope
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-500 hover:text-slate-700",
                        )}
                      >
                        {scope === "courier"
                          ? "Courier"
                          : scope === "network"
                            ? "ZetSales Network"
                            : "This Store"}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  {avatar && (
                    <div
                      className={clsx(
                        "flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white",
                        avatar.color,
                      )}
                    >
                      {avatar.initials}
                    </div>
                  )}
                  <div>
                    {editingName ? (
                      <span className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveName();
                            if (e.key === "Escape") setEditingName(false);
                          }}
                          className="w-40 rounded border border-slate-300 px-1.5 py-0.5 text-sm outline-none focus:border-indigo-400"
                        />
                        <button
                          onClick={saveName}
                          className="text-emerald-600 hover:text-emerald-700"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          onClick={() => setEditingName(false)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ) : lockedByOther ? (
                      <p className="text-sm font-semibold text-slate-800">
                        {detail.customerName || "No name"}
                      </p>
                    ) : (
                      <button
                        onClick={() => {
                          setNameInput(detail.customerName ?? "");
                          setEditingName(true);
                        }}
                        className="flex items-center gap-1 text-sm font-semibold text-slate-800 hover:text-indigo-600"
                      >
                        {detail.customerName || "No name"}
                        <Pencil size={11} className="text-slate-300" />
                      </button>
                    )}
                    {fraudCheckerInstalled && risk && (
                      <p className="text-xs text-slate-400">
                        {risk.totalOrders} past order
                        {risk.totalOrders === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                </div>
                {fraudCheckerInstalled &&
                  riskScope === "courier" &&
                  courierUnavailable && (
                    <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                      Courier data unavailable right now — the Steadfast check
                      failed or is temporarily paused. This is not the same as a
                      real "New Customer" result.
                    </div>
                  )}
                {fraudCheckerInstalled &&
                  !(riskScope === "courier" && courierUnavailable) &&
                  risk && (
                    <div className="mt-3">
                      <RiskBadge risk={risk} />
                    </div>
                  )}
                {fraudCheckerInstalled &&
                  !(riskScope === "courier" && courierUnavailable) &&
                  risk &&
                  risk.courierBreakdown.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {risk.courierBreakdown.map((c) =>
                        c.unavailable ? (
                          <div
                            key={c.courierPartner}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs"
                          >
                            <span className="font-semibold text-slate-700">
                              {c.courierPartner}
                            </span>{" "}
                            <span
                              title="Could not verify this courier's delivery history right now — not confirmed as a real result."
                              className="font-medium text-slate-400"
                            >
                              Check Failed
                            </span>
                          </div>
                        ) : (
                          <div
                            key={c.courierPartner}
                            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
                          >
                            <span className="font-semibold text-slate-700">
                              {c.courierPartner}
                            </span>{" "}
                            <span className="text-emerald-600">
                              {c.delivered} delivered
                            </span>
                            {" · "}
                            <span className="text-rose-500">
                              {c.failed} failed
                            </span>
                            {c.stale && (
                              <span
                                title={
                                  c.checkedAt
                                    ? `Live check failed — showing the last known result from ${new Date(c.checkedAt).toLocaleString()}`
                                    : "Live check failed — showing the last known result"
                                }
                                className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                              >
                                last known
                              </span>
                            )}
                          </div>
                        ),
                      )}
                    </div>
                  )}
                {fraudCheckerInstalled &&
                  risk &&
                  risk.possibleDuplicateOrders.length > 0 && (
                    <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                      Possible duplicate — this phone number also has{" "}
                      {risk.possibleDuplicateOrders.length === 1
                        ? "an active order"
                        : `${risk.possibleDuplicateOrders.length} other active orders`}{" "}
                      placed today: {risk.possibleDuplicateOrders.join(", ")}
                    </div>
                  )}
                <div className="mt-3 space-y-1.5 text-sm text-slate-600">
                  {detail.customerPhone && (
                    <div className="flex items-center gap-2">
                      <Phone size={13} className="text-slate-400 shrink-0" />
                      {editingPhone ? (
                        <span className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={phoneInput}
                            onChange={(e) => setPhoneInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") savePhone();
                              if (e.key === "Escape") setEditingPhone(false);
                            }}
                            className="w-32 rounded border border-slate-300 px-1.5 py-0.5 text-sm outline-none focus:border-indigo-400"
                          />
                          <button
                            onClick={savePhone}
                            className="text-emerald-600 hover:text-emerald-700"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            onClick={() => setEditingPhone(false)}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            <X size={13} />
                          </button>
                        </span>
                      ) : lockedByOther ? (
                        <span>{detail.customerPhone}</span>
                      ) : (
                        <button
                          onClick={() => {
                            setPhoneInput(detail.customerPhone ?? "");
                            setEditingPhone(true);
                          }}
                          className="flex items-center gap-1 hover:text-indigo-600"
                        >
                          {detail.customerPhone}
                          <Pencil size={11} className="text-slate-300" />
                        </button>
                      )}
                      {detail.callAttempts > 0 && (
                        <span className="text-[11px] text-slate-400">
                          ({detail.callAttempts} call
                          {detail.callAttempts > 1 ? "s" : ""})
                        </span>
                      )}
                      {lockedByOther ? (
                        <span className="text-[11px] font-medium text-slate-300">
                          Log call
                        </span>
                      ) : (
                        <Popover
                          align="left"
                          widthClass="w-48"
                          trigger={() => (
                            <button className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700">
                              Log call
                            </button>
                          )}
                        >
                          {(close) => (
                            <div className="p-1.5">
                              <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                Call outcome
                              </p>
                              {CALL_OUTCOMES.map((outcome) => (
                                <button
                                  key={outcome}
                                  onClick={() => {
                                    close();
                                    void apply({
                                      incrementCallAttempt: true,
                                      callOutcome: outcome as CallOutcome,
                                    });
                                  }}
                                  className={clsx(
                                    "block w-full rounded-md px-2 py-1.5 text-left text-[12.5px] font-medium hover:bg-slate-50",
                                    outcome === "Confirmed"
                                      ? "text-emerald-700"
                                      : outcome === "Rescheduled"
                                        ? "text-sky-700"
                                        : "text-slate-600",
                                  )}
                                >
                                  {outcome}
                                </button>
                              ))}
                            </div>
                          )}
                        </Popover>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Phone size={13} className="text-slate-300 shrink-0" />
                    {editingAltPhone ? (
                      <span className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={altPhoneInput}
                          onChange={(e) => setAltPhoneInput(e.target.value)}
                          placeholder="Alternative number"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveAltPhone();
                            if (e.key === "Escape") setEditingAltPhone(false);
                          }}
                          className="w-32 rounded border border-slate-300 px-1.5 py-0.5 text-sm outline-none focus:border-indigo-400"
                        />
                        <button
                          onClick={saveAltPhone}
                          className="text-emerald-600 hover:text-emerald-700"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          onClick={() => setEditingAltPhone(false)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ) : lockedByOther ? (
                      detail.customerAltPhone && (
                        <span className="text-slate-500">
                          {detail.customerAltPhone}{" "}
                          <span className="text-[10px] text-slate-400">
                            (alt)
                          </span>
                        </span>
                      )
                    ) : (
                      <button
                        onClick={() => {
                          setAltPhoneInput(detail.customerAltPhone ?? "");
                          setEditingAltPhone(true);
                        }}
                        className="flex items-center gap-1 text-slate-500 hover:text-indigo-600"
                      >
                        {detail.customerAltPhone ? (
                          <>
                            {detail.customerAltPhone}{" "}
                            <span className="text-[10px] text-slate-400">
                              (alt)
                            </span>
                          </>
                        ) : (
                          "+ Add alternative number"
                        )}
                        <Pencil size={11} className="text-slate-300" />
                      </button>
                    )}
                  </div>
                  {detail.customerEmail && (
                    <div className="flex items-center gap-2">
                      <Mail size={13} className="text-slate-400 shrink-0" />{" "}
                      {detail.customerEmail}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <MapPin size={13} className="text-slate-400 shrink-0" />
                    {editingAddress ? (
                      <span className="flex flex-1 items-center gap-1">
                        <input
                          autoFocus
                          value={addressInput}
                          onChange={(e) => setAddressInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveAddress();
                            if (e.key === "Escape") setEditingAddress(false);
                          }}
                          className="w-full rounded border border-slate-300 px-1.5 py-0.5 text-sm outline-none focus:border-indigo-400"
                        />
                        <button
                          onClick={saveAddress}
                          className="text-emerald-600 hover:text-emerald-700 shrink-0"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          onClick={() => setEditingAddress(false)}
                          className="text-slate-400 hover:text-slate-600 shrink-0"
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ) : lockedByOther ? (
                      <span>
                        {[detail.address, detail.deliveryZone]
                          .filter(Boolean)
                          .join(" · ") || "No address"}
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          setAddressInput(detail.address ?? "");
                          setEditingAddress(true);
                        }}
                        className="flex items-center gap-1 text-left hover:text-indigo-600"
                      >
                        {detail.address
                          ? [detail.address, detail.deliveryZone]
                              .filter(Boolean)
                              .join(" · ")
                          : detail.deliveryZone || "+ Add address"}
                        <Pencil size={11} className="shrink-0 text-slate-300" />
                      </button>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Courier
                </h3>
                {needsTrackingCode && (
                  <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                    Ready for pickup, but no tracking code yet —{" "}
                    {detail.courierPartner} isn't connected via API for this
                    order. Enter the code from your courier receipt below.
                  </div>
                )}
                {courierRequiredForNextStep && (
                  <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                    Choose a courier before moving this order to the courier handover flow.
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500">
                      <span>Partner</span>
                      {courierRequiredForNextStep && (
                        <span className="text-amber-600">Required</span>
                      )}
                    </label>
                    {courierLocked ? (
                      <div
                        title="Already handed off to this courier — the consignment can't be moved to a different one from here."
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-sm text-slate-600"
                      >
                        {detail.courierPartner}
                        <Lock size={12} className="shrink-0 text-slate-400" />
                      </div>
                    ) : (
                      <Select
                        value={detail.courierPartner ?? ""}
                        onChange={(value) =>
                          void apply({
                            courierPartner:
                              value === ""
                                ? null
                                : (value as "Steadfast" | "Pathao"),
                          })
                        }
                        options={[
                          { value: "", label: "Unassigned" },
                          ...couriers.map((c) => ({
                            value: PROVIDER_LABEL[c.provider],
                            label: PROVIDER_LABEL[c.provider],
                          })),
                          // Order references a courier that's since been disconnected — keep it selectable
                          // and visibly labeled rather than have the dropdown silently show blank.
                          ...(detail.courierPartner &&
                          !couriers.some(
                            (c) =>
                              PROVIDER_LABEL[c.provider] ===
                              detail.courierPartner,
                          )
                            ? [
                                {
                                  value: detail.courierPartner,
                                  label: `${detail.courierPartner} (disconnected)`,
                                },
                              ]
                            : []),
                        ]}
                        className="bg-slate-50"
                      />
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                      Tracking ID
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        value={trackingInput}
                        onChange={(e) => setTrackingInput(e.target.value)}
                        onBlur={() =>
                          trackingInput !== (detail.courierTrackingId ?? "") &&
                          apply({ courierTrackingId: trackingInput || null })
                        }
                        placeholder="Not set"
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:bg-white"
                      />
                      {detail.courierTrackingId && (
                        <button
                          onClick={copyTracking}
                          className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          {copied ? (
                            <Check size={13} className="text-emerald-600" />
                          ) : (
                            <Copy size={13} />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                      Delivery zone
                    </label>
                    {addingZone ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={newZoneName}
                          onChange={(e) => setNewZoneName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveNewZone();
                            if (e.key === "Escape") {
                              setAddingZone(false);
                              setNewZoneName("");
                            }
                          }}
                          placeholder="e.g. Mirpur-10"
                          className="w-full rounded-lg border border-indigo-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400"
                        />
                        <button
                          onClick={() => void saveNewZone()}
                          className="shrink-0 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => {
                            setAddingZone(false);
                            setNewZoneName("");
                          }}
                          className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      // A picker instead of free text — every value that's ever set here came from the
                      // shared, case-insensitively-deduped zone list, so the Delivery Zones analytics
                      // breakdown can't fragment into "Mirpur" vs "mirpur" vs "Mirpur-10" anymore.
                      <Select
                        value={detail.deliveryZone ?? ""}
                        onChange={(value) => {
                          if (value === "__add__") {
                            setAddingZone(true);
                            return;
                          }
                          void apply({
                            deliveryZone: value === "" ? null : value,
                          });
                        }}
                        options={[
                          { value: "", label: "Not set" },
                          ...zones.map((z) => ({
                            value: z.name,
                            label: z.name,
                          })),
                          ...(detail.deliveryZone &&
                          !zones.some((z) => z.name === detail.deliveryZone)
                            ? [
                                {
                                  value: detail.deliveryZone,
                                  label: `${detail.deliveryZone} (removed)`,
                                },
                              ]
                            : []),
                          { value: "__add__", label: "+ Add new zone..." },
                        ]}
                        className="bg-slate-50"
                      />
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                      Rate zone
                    </label>
                    {/* Unlike Partner/Tracking ID, this never re-books anything with the courier — it's
                        ZetSales' own cost prediction, so it stays editable even after dispatch so staff can
                        correct it against the courier's real invoice during reconciliation. */}
                    <Select
                      value={detail.courierZoneTier ?? "outside"}
                      onChange={(value) =>
                        void apply({
                          courierZoneTier: value as
                            | "inside"
                            | "outside"
                            | "suburb",
                        })
                      }
                      options={[
                        { value: "inside", label: "Inside Dhaka" },
                        { value: "outside", label: "Outside Dhaka" },
                        { value: "suburb", label: "Sub-urb" },
                      ]}
                      className="bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                      Speed
                    </label>
                    <Select
                      value={detail.courierSpeed ?? "regular"}
                      onChange={(value) =>
                        void apply({
                          courierSpeed: value as "regular" | "express",
                        })
                      }
                      options={[
                        { value: "regular", label: "Regular" },
                        { value: "express", label: "Express" },
                      ]}
                      className="bg-slate-50"
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Items
                </h3>
                <div className="space-y-3">
                  {detail.lineItems.map((li, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-400">
                          {li.image ? (
                            <img
                              src={li.image}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Package size={15} />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-slate-700">
                            {li.title}
                          </p>
                          <p className="text-xs text-slate-400">
                            {li.variant ? `${li.variant} · ` : ""}Qty{" "}
                            {li.quantity}
                            {li.sku ? ` · ${li.sku}` : ""}
                          </p>
                          {(() => {
                            const free = resolveFreeStock(stockLookup, li.sku);
                            if (free === null) {
                              // Distinct from "loading" (stockLookup is still undefined right after the
                              // drawer opens) — once it's actually loaded, a still-null result means this
                              // SKU has no inventory record at all, which staff need to see, not a blank
                              // space that reads the same as "definitely fine."
                              if (!stockLookup) return null;
                              return (
                                <p className="mt-0.5 text-xs font-medium text-slate-400">
                                  Stock not tracked
                                </p>
                              );
                            }
                            const short = free < li.quantity;
                            return (
                              <p
                                className={clsx(
                                  "mt-0.5 text-xs font-semibold",
                                  short ? "text-rose-600" : "text-emerald-600",
                                )}
                              >
                                {short
                                  ? `Out of stock · only ${free} free`
                                  : `${free} in stock`}
                              </p>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums text-slate-700">
                          {detail.currency}{" "}
                          {(li.price * li.quantity).toLocaleString()}
                        </span>
                        {LINE_ITEM_EDITABLE_STAGES.includes(detail.stage) &&
                          detail.lineItems.length > 1 && (
                            <button
                              onClick={() => void removeLineItem(i)}
                              disabled={
                                !!lockedByOther || removingItemIndex === i
                              }
                              title={lockedByOther ?? "Remove this item"}
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-300 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {removingItemIndex === i ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <X size={12} />
                              )}
                            </button>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
                {LINE_ITEM_EDITABLE_STAGES.includes(detail.stage) && (
                  <button
                    onClick={openAddProduct}
                    disabled={!!lockedByOther}
                    title={lockedByOther ?? undefined}
                    className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 disabled:cursor-not-allowed disabled:text-slate-300"
                  >
                    <Plus size={13} /> Add product
                  </button>
                )}
                <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-sm">
                  <div className="flex justify-between text-slate-500">
                    <span>Subtotal</span>
                    <span className="tabular-nums">
                      {detail.currency} {detail.subtotal.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Shipping</span>
                    {feeLocked ? (
                      <span className="tabular-nums">
                        {detail.currency} {detail.shippingFee.toLocaleString()}
                      </span>
                    ) : editingShipping ? (
                      <span className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          autoFocus
                          value={shippingInput}
                          onChange={(e) => setShippingInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveShippingFee();
                            if (e.key === "Escape") setEditingShipping(false);
                          }}
                          className="w-20 rounded border border-slate-300 px-1.5 py-0.5 text-xs tabular-nums outline-none focus:border-indigo-400"
                        />
                        <button
                          onClick={saveShippingFee}
                          className="text-emerald-600 hover:text-emerald-700"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          onClick={() => setEditingShipping(false)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          setShippingInput(String(detail.shippingFee));
                          setEditingShipping(true);
                        }}
                        className="flex items-center gap-1 tabular-nums hover:text-indigo-600"
                      >
                        {detail.currency} {detail.shippingFee.toLocaleString()}
                        <Pencil size={11} className="text-slate-300" />
                      </button>
                    )}
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Discount</span>
                    {feeLocked ? (
                      <span className="tabular-nums">
                        {detail.discount > 0 ? "- " : ""}
                        {detail.currency} {detail.discount.toLocaleString()}
                      </span>
                    ) : editingDiscount ? (
                      <span className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          autoFocus
                          value={discountInput}
                          onChange={(e) => setDiscountInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveDiscount();
                            if (e.key === "Escape") setEditingDiscount(false);
                          }}
                          className="w-20 rounded border border-slate-300 px-1.5 py-0.5 text-xs tabular-nums outline-none focus:border-indigo-400"
                        />
                        <button
                          onClick={saveDiscount}
                          className="text-emerald-600 hover:text-emerald-700"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          onClick={() => setEditingDiscount(false)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          setDiscountInput(String(detail.discount));
                          setEditingDiscount(true);
                        }}
                        className={clsx(
                          "flex items-center gap-1 tabular-nums hover:text-indigo-600",
                          detail.discount > 0 && "text-emerald-600",
                        )}
                      >
                        {detail.discount > 0 ? "- " : ""}
                        {detail.currency} {detail.discount.toLocaleString()}
                        <Pencil size={11} className="text-slate-300" />
                      </button>
                    )}
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Advance collected</span>
                    {feeLocked ? (
                      <span className="tabular-nums">
                        {detail.advanceAmount > 0 ? "- " : ""}
                        {detail.currency}{" "}
                        {detail.advanceAmount.toLocaleString()}
                      </span>
                    ) : editingAdvance ? (
                      <span className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          autoFocus
                          value={advanceInput}
                          onChange={(e) => setAdvanceInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveAdvance();
                            if (e.key === "Escape") setEditingAdvance(false);
                          }}
                          className="w-20 rounded border border-slate-300 px-1.5 py-0.5 text-xs tabular-nums outline-none focus:border-indigo-400"
                        />
                        <button
                          onClick={saveAdvance}
                          className="text-emerald-600 hover:text-emerald-700"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          onClick={() => setEditingAdvance(false)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          setAdvanceInput(String(detail.advanceAmount));
                          setEditingAdvance(true);
                        }}
                        className={clsx(
                          "flex items-center gap-1 tabular-nums hover:text-indigo-600",
                          detail.advanceAmount > 0 && "text-emerald-600",
                        )}
                      >
                        {detail.advanceAmount > 0 ? "- " : ""}
                        {detail.currency}{" "}
                        {detail.advanceAmount.toLocaleString()}
                        <Pencil size={11} className="text-slate-300" />
                      </button>
                    )}
                  </div>
                  <div className="flex justify-between font-semibold text-slate-900">
                    <span>Total</span>
                    <span className="tabular-nums">
                      {detail.currency} {detail.total.toLocaleString()}
                    </span>
                  </div>
                  {(detail.paymentStatus === "COD Pending" ||
                    detail.paymentStatus === "Advance Paid") && (
                    <div className="flex justify-between font-semibold text-amber-700">
                      <span>COD to collect</span>
                      <span className="tabular-nums">
                        {detail.currency}{" "}
                        {Math.max(
                          0,
                          detail.total - detail.advanceAmount,
                        ).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Timeline
                </h3>
                <div className="space-y-4">
                  {detail.history.map((event, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className="h-2 w-2 rounded-full bg-indigo-500" />
                        {i < detail.history.length - 1 && (
                          <span className="w-px flex-1 bg-slate-200 mt-1" />
                        )}
                      </div>
                      <div className="pb-1">
                        <p className="text-sm font-medium text-slate-700">
                          {event.label}
                        </p>
                        <p className="text-xs text-slate-400">{event.detail}</p>
                        <p className="text-[11px] text-slate-300">
                          {formatFullDate(event.at)}
                          {event.by ? ` · by ${event.by}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {detail.note &&
                !["On Hold", "Cancelled"].includes(detail.stage) && (
                  <section className="rounded-lg border border-slate-200 p-4">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Notes
                    </h3>
                    <p className="text-sm text-slate-600">{detail.note}</p>
                  </section>
                )}

              {/* admin.order-details.block extension target — Fraud Checker's own content (an
                  embedded app) plus AppBlock for any future oauth-type app filling this slot. */}
              {fraudCheckerInstalled && detail.flagReason && (
                <section className="rounded-lg border border-slate-200 p-4">
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <ShieldAlert size={13} className="text-rose-500" /> ZetSales
                    Fraud Checker
                  </h3>
                  <p className="text-sm text-slate-600">{detail.flagReason}</p>
                </section>
              )}
              <AppBlock
                target="admin.order-details.block"
                context={{ orderId: detail.id }}
              />
            </div>

            <div className="border-t border-slate-200 px-6 py-4">
              <AppBlock
                target="admin.order-details.action"
                context={{ orderId: detail.id }}
              />
              {isMixedOrder && (
                <label
                  className="mb-2.5 flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600"
                  title="Confirms this order for the item(s) you have in stock. The out-of-stock item(s) move to a separate order — already Confirmed too, shown in both Confirmed Orders and Pre-Orders until it's restocked, then you just send it to packing."
                >
                  <input
                    type="checkbox"
                    checked={splitChecked}
                    onChange={(e) => setSplitChecked(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Split this order
                </label>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {primaryAction && (
                  <button
                    onClick={() => {
                      if (fulfillmentBlocked) return;
                      if (isMixedOrder && splitChecked) {
                        void handleSplit();
                        return;
                      }
                      if (
                        (detail.stage === "Processing" ||
                          detail.stage === "Ready for Pickup") &&
                        !detail.courierPartner
                      ) {
                        setConfirmShipNoCourier(true);
                        return;
                      }
                      apply({ stage: primaryAction.nextStage });
                    }}
                    disabled={
                      fulfillmentBlocked ||
                      !!lockedByOther ||
                      (isMixedOrder && splitChecked && splitBusy)
                    }
                    title={
                      lockedByOther ??
                      (fulfillmentBlocked
                        ? (fulfillmentStatus?.reason ?? undefined)
                        : undefined)
                    }
                    className={clsx(
                      "flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors",
                      fulfillmentBlocked || lockedByOther
                        ? "cursor-not-allowed bg-slate-100 text-slate-400"
                        : "bg-slate-900 text-white hover:bg-slate-800",
                    )}
                  >
                    {isMixedOrder && splitChecked ? (
                      <Split size={14} />
                    ) : (
                      <primaryAction.icon size={14} />
                    )}
                    {isMixedOrder && splitChecked
                      ? "Split & List Remains as Pre-Order"
                      : hasShortItem
                        ? "Confirm & List as Pre-Order"
                        : primaryAction.label}
                  </button>
                )}
                {detail.stage === "Out for Delivery" && (
                  <button
                    onClick={() => setPartialModalOpen(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <PackageX size={14} /> Partial
                  </button>
                )}
                {secondaryActions.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => apply({ stage: action.nextStage })}
                    disabled={!!lockedByOther}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                  >
                    <action.icon size={14} /> {action.label}
                  </button>
                ))}
                {detail.stage === "On Hold" && (
                  <button
                    onClick={() => void apply({ resume: true })}
                    disabled={!!lockedByOther}
                    className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-slate-900"
                  >
                    <PlayCircle size={14} /> Reattempt
                  </button>
                )}
                {canHold(detail.stage) && (
                  <ReasonNoteMenu
                    align="left"
                    title="Put on hold"
                    reasons={holdReasons}
                    confirmLabel="Put on hold"
                    onApply={(reason, note, rescheduledFor) =>
                      void apply({
                        stage: "On Hold",
                        holdReason: reason,
                        note: note || null,
                        rescheduledFor,
                      })
                    }
                    trigger={() => (
                      <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer">
                        <PauseCircle size={14} /> Hold
                      </div>
                    )}
                  />
                )}
                {(priorityActionAvailable || detail.customerPhone) && (
                  <Popover
                    align="left"
                    widthClass="w-48"
                    trigger={() => (
                      <div className="flex h-[38px] w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors cursor-pointer">
                        <MoreVertical size={15} />
                      </div>
                    )}
                  >
                    {(close) => (
                      <div className="py-1.5">
                        {detail.isPriorityCall ? (
                          <button
                            onClick={() => {
                              close();
                              void apply({ isPriorityCall: false });
                            }}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
                          >
                            <PhoneOff size={13} className="text-slate-400" />{" "}
                            Unmark priority
                          </button>
                        ) : (
                          canMarkPriorityCall(detail.stage) && (
                            <button
                              onClick={() => {
                                close();
                                setPriorityNoteInput("");
                                setPriorityModalOpen(true);
                              }}
                              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
                            >
                              <PhoneCall size={13} className="text-slate-400" />{" "}
                              Mark priority
                            </button>
                          )
                        )}
                        {detail.paymentMethod === "Cash on Delivery" &&
                          detail.paymentStatus === "COD Pending" &&
                          ["Delivered", "Partial Delivered"].includes(
                            detail.stage,
                          ) && (
                            <button
                              onClick={() => {
                                close();
                                void handleMarkCollected();
                              }}
                              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
                            >
                              <Banknote size={13} className="text-slate-400" />{" "}
                              Mark COD collected
                            </button>
                          )}
                        {detail.customerPhone &&
                          (detail.isCustomerBlocked ? (
                            <button
                              onClick={() => {
                                close();
                                void toggleBlock(false, null);
                              }}
                              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
                            >
                              <UserCheck size={13} className="text-slate-400" />{" "}
                              Unblock customer
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                close();
                                setBlockNoteInput("");
                                setBlockModalOpen(true);
                              }}
                              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-rose-600 hover:bg-rose-50"
                            >
                              <UserX size={13} /> Block customer
                            </button>
                          ))}
                      </div>
                    )}
                  </Popover>
                )}
                <Popover
                  align="left"
                  widthClass="w-48"
                  trigger={() => (
                    <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer">
                      <Printer size={14} /> Print{" "}
                      <ChevronDown size={12} className="text-slate-400" />
                    </div>
                  )}
                >
                  {(close) => (
                    <div className="py-1.5">
                      <button
                        onClick={() => {
                          close();
                          setPrintDocType("invoice");
                        }}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        <FileText size={13} className="text-slate-400" />{" "}
                        Invoice
                      </button>
                      {detail && canPrintPackingSlip(detail.stage) && (
                        <>
                          <button
                            onClick={() => {
                              close();
                              void loadInventorySnapshot(detail.id);
                              setPrintDocType("packingSlip");
                            }}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
                          >
                            <ClipboardList
                              size={13}
                              className="text-slate-400"
                            />{" "}
                            Packing slip
                          </button>
                          <button
                            onClick={() => {
                              close();
                              void loadInventorySnapshot(detail.id);
                              setPrintDocType("combined");
                            }}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
                          >
                            <Scissors size={13} className="text-slate-400" />{" "}
                            Invoice + Slip
                          </button>
                        </>
                      )}
                      {detail.courierPartner && (
                        <button
                          onClick={() => {
                            close();
                            setLabelModalOpen(true);
                          }}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <Tag size={13} className="text-slate-400" /> Courier
                          label
                        </button>
                      )}
                    </div>
                  )}
                </Popover>
                {canCancel(detail.stage) && (
                  <ReasonNoteMenu
                    align="right"
                    wrapperClassName="ml-auto"
                    title="Cancel order"
                    reasons={ALL_CANCEL_REASONS}
                    defaultReason={inferCancelReason(detail)}
                    confirmLabel="Cancel order"
                    confirmTone="danger"
                    onApply={(reason, note) =>
                      void apply({
                        stage: "Cancelled",
                        cancelReason: reason,
                        note: note || null,
                      })
                    }
                    trigger={() => (
                      <div className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer">
                        <Ban size={14} /> Cancel
                      </div>
                    )}
                  />
                )}
              </div>
              {fulfillmentBlocked && fulfillmentStatus?.reason && (
                <p
                  className="mt-2 max-w-md text-[11px] text-amber-700"
                  title={fulfillmentStatus.reason}
                >
                  {/* the item name/variant is already shown in the Items section above, so only surface the short-by count here */}
                  {fulfillmentStatus.reason.replace(
                    /^Waiting on stock: .*? — /,
                    "",
                  )}
                </p>
              )}
            </div>
          </>
        )}
      </div>
      <PartialDeliverModal
        open={partialModalOpen}
        order={detail}
        onClose={() => setPartialModalOpen(false)}
        onApplied={() => {
          void refresh(order.id, { silent: true });
          onUpdated();
        }}
      />
      <PrintOrderModal
        open={printDocType !== null}
        onClose={() => setPrintDocType(null)}
        orders={detail ? [detail] : []}
        docType={printDocType ?? "invoice"}
        binLookup={binLookup}
      />
      <CourierLabelModal
        open={labelModalOpen}
        onClose={() => setLabelModalOpen(false)}
        orders={detail ? [detail] : []}
      />
      <Modal
        open={addProductOpen}
        onClose={() => setAddProductOpen(false)}
        title="Add product"
        subtitle="Upsell an extra item onto this order before it's confirmed."
      >
        <div className="space-y-3">
          <ProductPicker
            value={upsellPicked}
            onChange={(p) => void handlePickUpsellProduct(p)}
          />
          {upsellLoadingVariants ? (
            <p className="text-xs text-slate-400">Loading variants...</p>
          ) : (
            upsellPicked &&
            upsellVariants.length > 0 && (
              <>
                {upsellVariants.length > 1 && (
                  <Select
                    value={upsellVariantId}
                    onChange={setUpsellVariantId}
                    options={upsellVariants.map((v) => ({
                      value: v.id,
                      label: v.label,
                    }))}
                  />
                )}
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-500">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={upsellQuantity}
                    onChange={(e) => setUpsellQuantity(e.target.value)}
                    className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-indigo-400"
                  />
                </div>
              </>
            )
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setAddProductOpen(false)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={submitUpsell}
              disabled={!upsellPicked || !upsellVariantId || upsellSubmitting}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {upsellSubmitting ? "Adding..." : "Add to order"}
            </button>
          </div>
        </div>
      </Modal>
      <Modal
        open={confirmShipNoCourier}
        onClose={() => setConfirmShipNoCourier(false)}
        title="Courier required"
        subtitle="Pick a courier partner before this order moves to courier handover."
        widthClass="max-w-sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Go back to the Courier section above and choose a partner (Steadfast
            or Pathao) — that's what gets this order a tracking code and hands
            it off automatically once the courier handover starts.
          </p>
          <button
            onClick={() => setConfirmShipNoCourier(false)}
            className="w-full rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Go back
          </button>
        </div>
      </Modal>
      <Modal
        open={priorityModalOpen}
        onClose={() => setPriorityModalOpen(false)}
        title="Mark as priority call"
        widthClass="max-w-sm"
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Why? (optional)
            </label>
            <textarea
              value={priorityNoteInput}
              onChange={(e) => setPriorityNoteInput(e.target.value)}
              rows={2}
              placeholder="e.g. customer messaged on Facebook asking for a callback"
              className="w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-indigo-400"
            />
          </div>
          <button
            onClick={() => {
              void apply({
                isPriorityCall: true,
                priorityNote: priorityNoteInput.trim() || null,
              });
              setPriorityModalOpen(false);
            }}
            className="w-full rounded-lg bg-orange-600 py-1.5 text-sm font-semibold text-white hover:bg-orange-700"
          >
            Mark priority
          </button>
        </div>
      </Modal>
      <Modal
        open={blockModalOpen}
        onClose={() => setBlockModalOpen(false)}
        title="Block this customer"
        widthClass="max-w-sm"
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            Any future order synced from{" "}
            {detail?.customerPhone ?? "this phone number"} will be automatically
            cancelled instead of entering your normal workflow.
          </p>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Why? (optional)
            </label>
            <textarea
              value={blockNoteInput}
              onChange={(e) => setBlockNoteInput(e.target.value)}
              rows={2}
              placeholder="e.g. repeated fake orders, abusive on the phone"
              className="w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-indigo-400"
            />
          </div>
          <button
            onClick={() => {
              void toggleBlock(true, blockNoteInput.trim() || null);
              setBlockModalOpen(false);
            }}
            className="w-full rounded-lg bg-rose-600 py-1.5 text-sm font-semibold text-white hover:bg-rose-700"
          >
            Block customer
          </button>
        </div>
      </Modal>
    </div>
  );
}
