import { AlertTriangle, ArrowRight, Lock, Phone, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import type { CallCenterQueueItemDTO } from '@zetsales/shared';
import { formatMoney } from '../../../analytics/format';
import { CLAIM_TONE } from '../../../components/orders/orderTone';
import { useAuth } from '../../../context/AuthContext';

function agingTone(minutes: number): { text: string; ring: string } {
  if (minutes > 120) return { text: 'text-rose-600', ring: 'ring-rose-600/20 bg-rose-50' };
  if (minutes > 60) return { text: 'text-amber-600', ring: 'ring-amber-600/20 bg-amber-50' };
  return { text: 'text-slate-500', ring: 'ring-slate-500/15 bg-slate-50' };
}

function formatWaiting(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function CallQueue({ queue }: { queue: CallCenterQueueItemDTO[] }) {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-700">Call queue</h2>
        <button onClick={() => navigate('/orders')} className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-indigo-600">
          Open orders <ArrowRight size={12} />
        </button>
      </div>
      {queue.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-400">Queue is empty — every order has been called.</div>
      ) : (
        <div className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
          {queue.map((item) => {
            const tone = agingTone(item.waitingMinutes);
            return (
              <div key={item.orderId} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {item.isPriorityCall && <Star size={11} className="shrink-0 fill-amber-400 text-amber-400" />}
                    <p className="truncate text-[13px] font-semibold text-slate-800">{item.customerName || 'Unnamed customer'}</p>
                    <span className="shrink-0 text-[10.5px] text-slate-400">{item.number}</span>
                    {item.claimedBy && item.claimedBy.userId !== user?.id && (
                      <span
                        title={`${item.claimedBy.email} is currently calling this customer`}
                        className={clsx('inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset', CLAIM_TONE)}
                      >
                        <Lock size={9} /> {item.claimedBy.email.split('@')[0]}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                    {item.customerPhone && (
                      <a href={`tel:${item.customerPhone}`} className="flex items-center gap-1 font-medium text-indigo-600 hover:text-indigo-700">
                        <Phone size={10} /> {item.customerPhone}
                      </a>
                    )}
                    <span>{item.callAttempts} call{item.callAttempts === 1 ? '' : 's'}</span>
                    {item.lastOutcome && <span className="truncate">· {item.lastOutcome}</span>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[12.5px] font-semibold tabular-nums text-slate-800">{formatMoney(item.total)}</p>
                  <span className={clsx('mt-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset', tone.text, tone.ring)}>
                    {item.waitingMinutes > 120 && <AlertTriangle size={9} />}
                    {formatWaiting(item.waitingMinutes)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
