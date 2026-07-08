import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, MapPin, Phone, Mail, Package, PackageX, Ban, Printer, Loader2, Copy, Check, PauseCircle, PlayCircle, Pencil, PhoneCall, PhoneOff, MoreVertical,
  UserX, UserCheck, FileText, ClipboardList, Tag, ChevronDown, Lock, Scissors, Banknote,
} from 'lucide-react';
import clsx from 'clsx';
import type { CourierAccountDTO, CourierProvider, OrderDTO, OrderRiskDTO, StoreDTO } from '@zetsales/shared';
import { blockCustomer, getOrder, listInventory, markPaymentCollected, unblockCustomer, updateOrder } from '../../lib/commerceApi';
import { STAGE_TONE, STAGE_ICON, PAYMENT_TONE } from './orderTone';
import { STAGE_ORDER, NEXT_ACTION, SECONDARY_ACTIONS } from './stageFlow';
import { ALL_CANCEL_REASONS, canHold, canCancel, inferCancelReason, holdReasonsFor } from './reasons';
import { ReasonNoteMenu } from './ReasonNoteMenu';
import { RiskBadge } from './RiskBadge';
import { PartialDeliverModal } from './PartialDeliverModal';
import { PrintOrderModal, type PrintDocType } from './PrintOrderModal';
import { CourierLabelModal } from './CourierLabelModal';
import { PackOrderModal } from './PackOrderModal';
import { buildBinLookup, type BinLookup } from './binLookup';
import { buildStockLookup, resolveFreeStock, type StockLookup } from './stockLookup';
import { Popover } from '../ui/Popover';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { avatarFromName } from './avatar';
import { useToast } from '../ui/ToastProvider';

const PROVIDER_LABEL: Record<CourierProvider, 'Steadfast' | 'Pathao'> = { steadfast: 'Steadfast', pathao: 'Pathao' };

interface OrderDetailDrawerProps {
  order: OrderDTO | null;
  store: StoreDTO | null;
  couriers: CourierAccountDTO[];
  onClose: () => void;
  onUpdated: () => void;
}

function formatFullDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

const TERMINAL_STAGES = ['Delivered', 'Partial Delivered', 'Returned', 'Cancelled'];

function StageStepper({ order }: { order: OrderDTO }) {
  const exception = ['Returned', 'Partial Delivered', 'Cancelled', 'On Hold', 'Flagged', 'RTO Initiated', 'QC Pending'].includes(order.stage);
  const activeIndex = (() => {
    if (order.stage === 'Flagged' || order.stage === 'Cancelled') return 0;
    if (order.stage === 'On Hold') return order.heldFromStage ? Math.max(0, STAGE_ORDER.indexOf(order.heldFromStage)) : 0;
    if (['Returned', 'Partial Delivered', 'RTO Initiated', 'QC Pending'].includes(order.stage)) return STAGE_ORDER.indexOf('Out for Delivery');
    return STAGE_ORDER.indexOf(order.stage);
  })();

  const banner = (() => {
    switch (order.stage) {
      case 'Flagged':
        return { tone: 'rose', text: `Flagged for review: ${order.flagReason ?? 'Manual review requested'}` };
      case 'On Hold':
        return { tone: 'orange', text: `On hold: ${[order.holdReason ?? 'Manual review', order.note].filter(Boolean).join(' — ')}` };
      case 'Cancelled':
        return { tone: 'slate', text: `Cancelled: ${[order.cancelReason ?? 'Cancelled by staff', order.note].filter(Boolean).join(' — ')}` };
      case 'RTO Initiated':
        return { tone: 'orange', text: 'Delivery failed — the courier is bringing this order back to the warehouse. Stock stays held until it arrives.' };
      case 'QC Pending':
        return { tone: 'amber', text: 'Package is back at the warehouse, awaiting a quality check before it goes back into stock.' };
      case 'Returned':
        return { tone: 'rose', text: 'This order was returned to the warehouse.' };
      case 'Partial Delivered':
        return { tone: 'amber', text: 'Only part of this order was delivered — the rest was returned.' };
      default:
        return null;
    }
  })();

  return (
    <div>
      <div className="flex items-center">
        {STAGE_ORDER.map((stage, i) => {
          const done = i <= activeIndex && order.stage !== 'Flagged';
          return (
            <div key={stage} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={clsx(
                    'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold',
                    done ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'
                  )}
                >
                  {i + 1}
                </div>
                <span className={clsx('max-w-[64px] text-center text-[10px] leading-tight', done ? 'text-slate-700 font-medium' : 'text-slate-400')}>
                  {stage}
                </span>
              </div>
              {i < STAGE_ORDER.length - 1 && (
                <div className={clsx('mx-1 h-0.5 flex-1', i < activeIndex && !exception ? 'bg-indigo-600' : i < activeIndex ? 'bg-slate-300' : 'bg-slate-100')} />
              )}
            </div>
          );
        })}
      </div>
      {banner && (
        <div
          className={clsx('mt-3 rounded-lg px-3 py-2 text-xs font-medium', {
            'bg-rose-50 text-rose-700': banner.tone === 'rose',
            'bg-orange-50 text-orange-700': banner.tone === 'orange',
            'bg-slate-100 text-slate-600': banner.tone === 'slate',
            'bg-amber-50 text-amber-700': banner.tone === 'amber',
          })}
        >
          {banner.text}
        </div>
      )}
    </div>
  );
}

export function OrderDetailDrawer({ order, store, couriers, onClose, onUpdated }: OrderDetailDrawerProps) {
  const toast = useToast();
  const [detail, setDetail] = useState<OrderDTO | null>(null);
  const [risk, setRisk] = useState<OrderRiskDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingRisk, setCheckingRisk] = useState(false);
  const [copied, setCopied] = useState(false);
  const [partialModalOpen, setPartialModalOpen] = useState(false);
  const [priorityModalOpen, setPriorityModalOpen] = useState(false);
  const [priorityNoteInput, setPriorityNoteInput] = useState('');
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blockNoteInput, setBlockNoteInput] = useState('');
  const [editingShipping, setEditingShipping] = useState(false);
  const [shippingInput, setShippingInput] = useState('');
  const [editingDiscount, setEditingDiscount] = useState(false);
  const [discountInput, setDiscountInput] = useState('');
  const [trackingInput, setTrackingInput] = useState('');
  const [zoneInput, setZoneInput] = useState('');
  const [printDocType, setPrintDocType] = useState<PrintDocType | null>(null);
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [packModalOpen, setPackModalOpen] = useState(false);
  const [packBusy, setPackBusy] = useState(false);
  const [confirmShipNoCourier, setConfirmShipNoCourier] = useState(false);
  const [binLookup, setBinLookup] = useState<BinLookup | undefined>(undefined);
  const [stockLookup, setStockLookup] = useState<StockLookup | undefined>(undefined);

  // Bin + free-stock lookup, from one shared fetch — bin numbers back the packing slip and the
  // pick/pack checklist (resolved per-order against `fulfillmentWarehouseId`, see binLookup.ts for
  // why that has to be warehouse-aware), and free stock backs the per-line-item stock display in
  // the Items section below, so staff can see at a glance whether what was just confirmed is
  // actually still in the building.
  const loadInventorySnapshot = async () => {
    try {
      const res = await listInventory();
      setBinLookup(buildBinLookup(res.levels));
      setStockLookup(buildStockLookup(res.levels));
    } catch {
      // Both are supplementary context on top of the order itself; staff can still work without them.
    }
  };

  const refresh = async (id: string, { silent }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await getOrder(id);
      setDetail(res.order);
      setRisk(res.risk);
      setTrackingInput(res.order.courierTrackingId ?? '');
      setZoneInput(res.order.deliveryZone ?? '');
    } catch {
      toast.push('Could not load order details.', 'info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (order) {
      void refresh(order.id);
      void loadInventorySnapshot();
    } else {
      setDetail(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  const holdReasons = useMemo(() => holdReasonsFor(detail?.stage ?? 'Pending'), [detail?.stage]);

  const apply = async (payload: Parameters<typeof updateOrder>[1]) => {
    if (!order) return;
    try {
      await updateOrder(order.id, payload);
      await refresh(order.id, { silent: true });
      onUpdated();
    } catch {
      toast.push('Could not update this order.', 'info');
    }
  };

  // Exactly one connected courier and nothing assigned yet -> assign it automatically, removing a
  // redundant click for the common single-courier seller. Never guesses between two-plus couriers
  // (stays Unassigned so a human picks deliberately), and only fires once per order view — keyed by
  // order id — so manually clearing it back to Unassigned afterward isn't immediately undone.
  const autoAssignedOrderIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!detail || detail.courierPartner != null || couriers.length !== 1) return;
    if (autoAssignedOrderIdRef.current === detail.id) return;
    autoAssignedOrderIdRef.current = detail.id;
    void apply({ courierPartner: PROVIDER_LABEL[couriers[0].provider] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.id, detail?.courierPartner, couriers]);

  if (!order) return null;

  const toggleBlock = async (next: boolean, note: string | null) => {
    try {
      if (next) await blockCustomer(order.id, note);
      else await unblockCustomer(order.id);
      await refresh(order.id, { silent: true });
      onUpdated();
      toast.push(next ? 'Customer blocked — their future orders will be auto-cancelled.' : 'Customer unblocked.', 'success');
    } catch {
      toast.push('Could not update block status.', 'info');
    }
  };

  const handleMarkCollected = async () => {
    try {
      await markPaymentCollected(order.id);
      await refresh(order.id, { silent: true });
      onUpdated();
      toast.push('Marked as collected.', 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not mark this as collected.', 'info');
    }
  };

  const handleRecheckRisk = async () => {
    setCheckingRisk(true);
    await refresh(order.id, { silent: true });
    setCheckingRisk(false);
  };

  const copyTracking = () => {
    if (!detail?.courierTrackingId) return;
    navigator.clipboard.writeText(detail.courierTrackingId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const saveShippingFee = () => {
    const parsed = Number(shippingInput);
    if (Number.isFinite(parsed) && parsed >= 0) void apply({ shippingFee: parsed });
    setEditingShipping(false);
  };

  const saveDiscount = () => {
    const parsed = Number(discountInput);
    if (Number.isFinite(parsed) && parsed >= 0) void apply({ discount: parsed });
    setEditingDiscount(false);
  };

  const avatar = detail ? avatarFromName(detail.customerName) : null;
  const feeLocked = detail ? TERMINAL_STAGES.includes(detail.stage) : false;
  // Once a real consignment exists, the courier already has the parcel — changing "Partner" at that
  // point wouldn't cancel or re-route anything, it would just make the order say one courier while
  // the physical package (and its tracking/consignment id) belongs to another. Lock on dispatch, not
  // on stage, since an order can sit in Shipped without ever actually having dispatched (see the
  // "Ship anyway" no-courier path) and that case should still be freely editable.
  const courierLocked = detail ? Boolean(detail.courierConsignmentId) : false;
  const primaryAction = detail ? NEXT_ACTION[detail.stage] : undefined;
  const secondaryActions = detail ? SECONDARY_ACTIONS[detail.stage] ?? [] : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{order.number}</h2>
            <p className="text-xs text-slate-400">
              {store?.displayName ?? 'Unknown store'} {detail && `· ${formatFullDate(detail.createdAt)}`}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        {loading || !detail ? (
          <div className="flex-1 py-16 text-center text-sm text-slate-400">Loading...</div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              <section className="rounded-xl border border-slate-200 p-4">
                <StageStepper order={detail} />
              </section>

              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{detail.paymentMethod}</span>
                <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset', STAGE_TONE[detail.stage])}>
                  {(() => {
                    const Icon = STAGE_ICON[detail.stage];
                    return <Icon size={11} />;
                  })()}
                  {detail.stage}
                </span>
                <span className={clsx('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset', PAYMENT_TONE[detail.paymentStatus])}>
                  {detail.paymentStatus}
                </span>
                {detail.isPriorityCall && (
                  <span
                    title={detail.priorityNote ?? undefined}
                    className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 ring-1 ring-inset ring-orange-600/20"
                  >
                    <PhoneCall size={11} /> Priority call{detail.priorityNote ? `: ${detail.priorityNote}` : ''}
                  </span>
                )}
                {detail.isCustomerBlocked && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">
                    <UserX size={11} /> Blocked customer
                  </span>
                )}
                {detail.tags.map((t) => (
                  <span key={t} className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10">
                    {t}
                  </span>
                ))}
              </div>

              <section className="rounded-xl border border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Customer &amp; delivery risk</h3>
                  <button
                    onClick={handleRecheckRisk}
                    disabled={checkingRisk}
                    className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {checkingRisk ? <Loader2 size={12} className="animate-spin" /> : <Loader2 size={12} className="opacity-0" />}
                    {checkingRisk ? 'Checking...' : 'Recheck risk'}
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  {avatar && (
                    <div className={clsx('flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white', avatar.color)}>{avatar.initials}</div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{detail.customerName || 'No name'}</p>
                    {risk && (
                      <p className="text-xs text-slate-400">
                        {risk.totalOrders} past order{risk.totalOrders === 1 ? '' : 's'}
                      </p>
                    )}
                  </div>
                </div>
                {risk && (
                  <div className="mt-3">
                    <RiskBadge risk={risk} />
                  </div>
                )}
                <div className="mt-3 space-y-1.5 text-sm text-slate-600">
                  {detail.customerPhone && (
                    <div className="flex items-center gap-2">
                      <Phone size={13} className="text-slate-400 shrink-0" /> {detail.customerPhone}
                      {detail.callAttempts > 0 && (
                        <span className="text-[11px] text-slate-400">
                          ({detail.callAttempts} call{detail.callAttempts > 1 ? 's' : ''})
                        </span>
                      )}
                      <button
                        onClick={() => void apply({ incrementCallAttempt: true })}
                        className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
                      >
                        Log call
                      </button>
                    </div>
                  )}
                  {detail.customerEmail && (
                    <div className="flex items-center gap-2">
                      <Mail size={13} className="text-slate-400 shrink-0" /> {detail.customerEmail}
                    </div>
                  )}
                  {(detail.address || detail.deliveryZone) && (
                    <div className="flex items-center gap-2">
                      <MapPin size={13} className="text-slate-400 shrink-0" /> {[detail.address, detail.deliveryZone].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Courier</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-500">Partner</label>
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
                        value={detail.courierPartner ?? ''}
                        onChange={(value) => void apply({ courierPartner: value === '' ? null : (value as 'Steadfast' | 'Pathao') })}
                        options={[
                          { value: '', label: 'Unassigned' },
                          ...couriers.map((c) => ({ value: PROVIDER_LABEL[c.provider], label: PROVIDER_LABEL[c.provider] })),
                          // Order references a courier that's since been disconnected — keep it selectable
                          // and visibly labeled rather than have the dropdown silently show blank.
                          ...(detail.courierPartner && !couriers.some((c) => PROVIDER_LABEL[c.provider] === detail.courierPartner)
                            ? [{ value: detail.courierPartner, label: `${detail.courierPartner} (disconnected)` }]
                            : []),
                        ]}
                        className="bg-slate-50"
                      />
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-500">Tracking ID</label>
                    <div className="flex items-center gap-1">
                      <input
                        value={trackingInput}
                        onChange={(e) => setTrackingInput(e.target.value)}
                        onBlur={() => trackingInput !== (detail.courierTrackingId ?? '') && apply({ courierTrackingId: trackingInput || null })}
                        placeholder="Not set"
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:bg-white"
                      />
                      {detail.courierTrackingId && (
                        <button onClick={copyTracking} className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                          {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-[11px] font-semibold text-slate-500">Delivery zone</label>
                    <input
                      value={zoneInput}
                      onChange={(e) => setZoneInput(e.target.value)}
                      onBlur={() => zoneInput !== (detail.deliveryZone ?? '') && apply({ deliveryZone: zoneInput || null })}
                      placeholder="Not set"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:bg-white"
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Items</h3>
                <div className="space-y-3">
                  {detail.lineItems.map((li, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                          <Package size={15} />
                        </div>
                        <div>
                          <p className="font-medium text-slate-700">{li.title}</p>
                          <p className="text-xs text-slate-400">
                            {li.variant ? `${li.variant} · ` : ''}Qty {li.quantity}
                            {li.sku ? ` · ${li.sku}` : ''}
                          </p>
                          {(() => {
                            const free = resolveFreeStock(stockLookup, li.sku);
                            if (free === null) return null;
                            const short = free < li.quantity;
                            return (
                              <p className={clsx('mt-0.5 text-xs font-semibold', short ? 'text-rose-600' : 'text-emerald-600')}>
                                {short ? `Out of stock · only ${free} free` : `${free} in stock`}
                              </p>
                            );
                          })()}
                        </div>
                      </div>
                      <span className="tabular-nums text-slate-700">
                        {detail.currency} {(li.price * li.quantity).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
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
                            if (e.key === 'Enter') saveShippingFee();
                            if (e.key === 'Escape') setEditingShipping(false);
                          }}
                          className="w-20 rounded border border-slate-300 px-1.5 py-0.5 text-xs tabular-nums outline-none focus:border-indigo-400"
                        />
                        <button onClick={saveShippingFee} className="text-emerald-600 hover:text-emerald-700">
                          <Check size={13} />
                        </button>
                        <button onClick={() => setEditingShipping(false)} className="text-slate-400 hover:text-slate-600">
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
                        {detail.discount > 0 ? '- ' : ''}
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
                            if (e.key === 'Enter') saveDiscount();
                            if (e.key === 'Escape') setEditingDiscount(false);
                          }}
                          className="w-20 rounded border border-slate-300 px-1.5 py-0.5 text-xs tabular-nums outline-none focus:border-indigo-400"
                        />
                        <button onClick={saveDiscount} className="text-emerald-600 hover:text-emerald-700">
                          <Check size={13} />
                        </button>
                        <button onClick={() => setEditingDiscount(false)} className="text-slate-400 hover:text-slate-600">
                          <X size={13} />
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          setDiscountInput(String(detail.discount));
                          setEditingDiscount(true);
                        }}
                        className={clsx('flex items-center gap-1 tabular-nums hover:text-indigo-600', detail.discount > 0 && 'text-emerald-600')}
                      >
                        {detail.discount > 0 ? '- ' : ''}
                        {detail.currency} {detail.discount.toLocaleString()}
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
                  {detail.paymentStatus === 'COD Pending' && (
                    <div className="flex justify-between font-semibold text-amber-700">
                      <span>COD to collect</span>
                      <span className="tabular-nums">
                        {detail.currency} {detail.total.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Timeline</h3>
                <div className="space-y-4">
                  {detail.history.map((event, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className="h-2 w-2 rounded-full bg-indigo-500" />
                        {i < detail.history.length - 1 && <span className="w-px flex-1 bg-slate-200 mt-1" />}
                      </div>
                      <div className="pb-1">
                        <p className="text-sm font-medium text-slate-700">{event.label}</p>
                        <p className="text-xs text-slate-400">{event.detail}</p>
                        <p className="text-[11px] text-slate-300">
                          {formatFullDate(event.at)}
                          {event.by ? ` · by ${event.by}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {detail.note && !['On Hold', 'Cancelled'].includes(detail.stage) && (
                <section className="rounded-xl border border-slate-200 p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</h3>
                  <p className="text-sm text-slate-600">{detail.note}</p>
                </section>
              )}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-slate-200 px-6 py-4">
              {primaryAction && (
                <button
                  onClick={() => {
                    // Processing -> Shipped is the "hand it off" moment — gate it behind the
                    // pick/pack checklist instead of advancing the stage on a single click, so
                    // staff actually look at what's in the box before it leaves the building.
                    if (detail.stage === 'Processing') {
                      void loadInventorySnapshot();
                      setPackModalOpen(true);
                    } else {
                      apply({ stage: primaryAction.nextStage });
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
                >
                  <primaryAction.icon size={14} /> {primaryAction.label}
                </button>
              )}
              {detail.stage === 'Out for Delivery' && (
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
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <action.icon size={14} /> {action.label}
                </button>
              ))}
              {detail.stage === 'On Hold' && (
                <button
                  onClick={() => void apply({ resume: true })}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
                >
                  <PlayCircle size={14} /> Resume
                </button>
              )}
              {canHold(detail.stage) && (
                <ReasonNoteMenu
                  align="left"
                  title="Put on hold"
                  reasons={holdReasons}
                  confirmLabel="Put on hold"
                  onApply={(reason, note, rescheduledFor) => void apply({ stage: 'On Hold', holdReason: reason, note: note || null, rescheduledFor })}
                  trigger={() => (
                    <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer">
                      <PauseCircle size={14} /> Hold
                    </div>
                  )}
                />
              )}
              {(detail.isPriorityCall || !feeLocked || detail.customerPhone) && (
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
                          <PhoneOff size={13} className="text-slate-400" /> Unmark priority
                        </button>
                      ) : (
                        !feeLocked && (
                          <button
                            onClick={() => {
                              close();
                              setPriorityNoteInput('');
                              setPriorityModalOpen(true);
                            }}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
                          >
                            <PhoneCall size={13} className="text-slate-400" /> Mark priority
                          </button>
                        )
                      )}
                      {detail.paymentMethod === 'Cash on Delivery' && detail.paymentStatus === 'COD Pending' && (
                        <button
                          onClick={() => {
                            close();
                            void handleMarkCollected();
                          }}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <Banknote size={13} className="text-slate-400" /> Mark COD collected
                        </button>
                      )}
                      {detail.customerPhone && (
                        detail.isCustomerBlocked ? (
                          <button
                            onClick={() => {
                              close();
                              void toggleBlock(false, null);
                            }}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
                          >
                            <UserCheck size={13} className="text-slate-400" /> Unblock customer
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              close();
                              setBlockNoteInput('');
                              setBlockModalOpen(true);
                            }}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-rose-600 hover:bg-rose-50"
                          >
                            <UserX size={13} /> Block customer
                          </button>
                        )
                      )}
                    </div>
                  )}
                </Popover>
              )}
              <Popover
                align="left"
                widthClass="w-48"
                trigger={() => (
                  <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer">
                    <Printer size={14} /> Print <ChevronDown size={12} className="text-slate-400" />
                  </div>
                )}
              >
                {(close) => (
                  <div className="py-1.5">
                    <button
                      onClick={() => {
                        close();
                        setPrintDocType('invoice');
                      }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <FileText size={13} className="text-slate-400" /> Invoice
                    </button>
                    <button
                      onClick={() => {
                        close();
                        void loadInventorySnapshot();
                        setPrintDocType('packingSlip');
                      }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <ClipboardList size={13} className="text-slate-400" /> Packing slip
                    </button>
                    <button
                      onClick={() => {
                        close();
                        void loadInventorySnapshot();
                        setPrintDocType('combined');
                      }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <Scissors size={13} className="text-slate-400" /> Invoice + Slip
                    </button>
                    {detail.courierPartner && (
                      <button
                        onClick={() => {
                          close();
                          setLabelModalOpen(true);
                        }}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        <Tag size={13} className="text-slate-400" /> Courier label
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
                  onApply={(reason, note) => void apply({ stage: 'Cancelled', cancelReason: reason, note: note || null })}
                  trigger={() => (
                    <div className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer">
                      <Ban size={14} /> Cancel
                    </div>
                  )}
                />
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
      <PrintOrderModal open={printDocType !== null} onClose={() => setPrintDocType(null)} orders={detail ? [detail] : []} docType={printDocType ?? 'invoice'} binLookup={binLookup} />
      <CourierLabelModal open={labelModalOpen} onClose={() => setLabelModalOpen(false)} orders={detail ? [detail] : []} />
      <PackOrderModal
        open={packModalOpen}
        order={detail}
        binLookup={binLookup}
        busy={packBusy}
        onClose={() => setPackModalOpen(false)}
        onConfirm={async () => {
          // Shipping without a courier assigned means it never gets handed off automatically — not
          // wrong (self-delivery, in-store pickup, or an unconnected courier are all legitimate),
          // but easy to do by accident, so it's a confirmation, not a hard block.
          if (!detail?.courierPartner) {
            setPackModalOpen(false);
            setConfirmShipNoCourier(true);
            return;
          }
          setPackBusy(true);
          await apply({ stage: 'Shipped' });
          setPackBusy(false);
          setPackModalOpen(false);
        }}
      />
      <Modal
        open={confirmShipNoCourier}
        onClose={() => setConfirmShipNoCourier(false)}
        title="No courier selected"
        subtitle="This order won't be handed off to a courier automatically without one."
        widthClass="max-w-sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            You can still mark it shipped and track it manually, or go back and pick a courier under the Courier section first.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmShipNoCourier(false)}
              className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Go back
            </button>
            <button
              onClick={async () => {
                setConfirmShipNoCourier(false);
                setPackBusy(true);
                await apply({ stage: 'Shipped' });
                setPackBusy(false);
              }}
              className="flex-1 rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Ship anyway
            </button>
          </div>
        </div>
      </Modal>
      <Modal open={priorityModalOpen} onClose={() => setPriorityModalOpen(false)} title="Mark as priority call" widthClass="max-w-sm">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Why? (optional)</label>
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
              void apply({ isPriorityCall: true, priorityNote: priorityNoteInput.trim() || null });
              setPriorityModalOpen(false);
            }}
            className="w-full rounded-lg bg-orange-600 py-1.5 text-sm font-semibold text-white hover:bg-orange-700"
          >
            Mark priority
          </button>
        </div>
      </Modal>
      <Modal open={blockModalOpen} onClose={() => setBlockModalOpen(false)} title="Block this customer" widthClass="max-w-sm">
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            Any future order synced from {detail?.customerPhone ?? 'this phone number'} will be automatically cancelled instead of entering your
            normal workflow.
          </p>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Why? (optional)</label>
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
