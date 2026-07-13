import type { CourierPartner, CourierStatusBucket } from '@zetsales/shared';

// Same brand colors as PROVIDER_META in CourierIntegrationsTab.tsx, duplicated here rather than
// imported — that map is keyed by lowercase CourierProvider ('steadfast'), while OrderDTO's
// courierPartner field this page reads directly is the capitalized CourierPartner ('Steadfast').
export const COURIER_PARTNER_META: Record<CourierPartner, { label: string; color: string }> = {
  Steadfast: { label: 'Steadfast', color: 'bg-[#e63946]' },
  Pathao: { label: 'Pathao', color: 'bg-[#f4364c]' },
};

export const COURIER_BUCKET_TONE: Record<CourierStatusBucket, string> = {
  awaiting_sync: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  accepted: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  picked: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  in_transit: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  delivered: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  partial: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  returned: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  cancelled: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  hold: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  other: 'bg-slate-100 text-slate-500 ring-slate-500/20',
};
