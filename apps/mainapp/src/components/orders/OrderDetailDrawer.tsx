import { useEffect, useState } from 'react';
import {
  X, MapPin, Phone, Mail, Package, Ban, Printer, Loader2, Copy, Check, PauseCircle, PlayCircle, Pencil,
} from 'lucide-react';
import clsx from 'clsx';
import type { OrderDTO, OrderRiskDTO, StoreDTO } from '@zetsales/shared';
import { getOrder, updateOrder } from '../../lib/commerceApi';
import { STAGE_TONE, STAGE_ICON, PAYMENT_TONE } from './orderTone';
import { STAGE_ORDER, NEXT_ACTION, SECONDARY_ACTIONS } from './stageFlow';
import { ALL_HOLD_REASONS, ALL_CANCEL_REASONS, canHold, canCancel, inferCancelReason } from './reasons';
import { ReasonNoteMenu } from './ReasonNoteMenu';
import { RiskBadge } from './RiskBadge';
import { avatarFromName } from './avatar';
import { useToast } from '../ui/ToastProvider';

interface OrderDetailDrawerProps {
  order: OrderDTO | null;
  store: StoreDTO | null;
  onClose: () => void;
  onUpdated: () => void;
}

function formatFullDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

const TERMINAL_STAGES = ['Delivered', 'Partial Delivered', 'Returned', 'Cancelled'];

function StageStepper({ order }: { order: OrderDTO }) {
  const exception = ['Returned', 'Partial Delivered', 'Cancelled', 'On Hold', 'Flagged'].includes(order.stage);
  const activeIndex = (() => {
    if (order.stage === 'Flagged' || order.stage === 'Cancelled') return 0;
    if (order.stage === 'On Hold') return order.heldFromStage ? Math.max(0, STAGE_ORDER.indexOf(order.heldFromStage)) : 0;
    if (order.stage === 'Returned' || order.stage === 'Partial Delivered') return STAGE_ORDER.indexOf('Out for Delivery');
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

export function OrderDetailDrawer({ order, store, onClose, onUpdated }: OrderDetailDrawerProps) {
  const toast = useToast();
  const [detail, setDetail] = useState<OrderDTO | null>(null);
  const [risk, setRisk] = useState<OrderRiskDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingRisk, setCheckingRisk] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingShipping, setEditingShipping] = useState(false);
  const [shippingInput, setShippingInput] = useState('');
  const [courierInput, setCourierInput] = useState('');
  const [trackingInput, setTrackingInput] = useState('');
  const [zoneInput, setZoneInput] = useState('');

  const refresh = async (id: string, { silent }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await getOrder(id);
      setDetail(res.order);
      setRisk(res.risk);
      setCourierInput(res.order.courierPartner ?? '');
      setTrackingInput(res.order.courierTrackingId ?? '');
      setZoneInput(res.order.deliveryZone ?? '');
    } catch {
      toast.push('Could not load order details.', 'info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (order) void refresh(order.id);
    else setDetail(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  if (!order) return null;

  const apply = async (payload: Parameters<typeof updateOrder>[1]) => {
    try {
      await updateOrder(order.id, payload);
      await refresh(order.id, { silent: true });
      onUpdated();
    } catch {
      toast.push('Could not update this order.', 'info');
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

  const avatar = detail ? avatarFromName(detail.customerName) : null;
  const feeLocked = detail ? TERMINAL_STAGES.includes(detail.stage) : false;
  const primaryAction = detail ? NEXT_ACTION[detail.stage] : undefined;
  const secondaryActions = detail ? SECONDARY_ACTIONS[detail.stage] ?? [] : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
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
                    <input
                      value={courierInput}
                      onChange={(e) => setCourierInput(e.target.value)}
                      onBlur={() => courierInput !== (detail.courierPartner ?? '') && apply({ courierPartner: courierInput || null })}
                      placeholder="Not assigned"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:bg-white"
                    />
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
                        <p className="text-[11px] text-slate-300">{formatFullDate(event.at)}</p>
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
                  onClick={() => apply({ stage: primaryAction.nextStage })}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
                >
                  <primaryAction.icon size={14} /> {primaryAction.label}
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
                  reasons={ALL_HOLD_REASONS}
                  confirmLabel="Put on hold"
                  onApply={(reason, note) => void apply({ stage: 'On Hold', holdReason: reason, note: note || null })}
                  trigger={() => (
                    <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer">
                      <PauseCircle size={14} /> Hold
                    </div>
                  )}
                />
              )}
              {detail.courierPartner && (
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Printer size={14} /> Print label
                </button>
              )}
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
    </div>
  );
}
