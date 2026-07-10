import type { OrderFunnelStageDTO, OrderStage } from '@zetsales/shared';
import { STAGE_LABEL } from '../../orders/orderTone';
import { ordinalStep } from '../chartTheme';

function stageLabel(stage: string): string {
  return STAGE_LABEL[stage as OrderStage] ?? stage;
}

interface FunnelChartProps {
  stages: OrderFunnelStageDTO[];
  formatCount: (v: number) => string;
}

// Stage order carries meaning (this is the whole point of a funnel), so it gets a single-hue
// ordinal ramp — light-to-dark indigo — rather than a categorical rainbow per stage. Each bar's
// width is proportional to its share of the first stage, so the drop-off is legible from shape
// alone; the conversion-from-previous % is the direct label that matters most and rides between
// bars rather than crowding onto them.
export function FunnelChart({ stages, formatCount }: FunnelChartProps) {
  const first = stages[0]?.count ?? 0;
  if (first === 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-slate-300">No orders in this period</div>;
  }

  return (
    <div className="space-y-1">
      {stages.map((s, i) => {
        const widthPct = Math.max(4, (s.count / first) * 100);
        return (
          <div key={s.stage}>
            {i > 0 && s.conversionFromPrevious != null && (
              <div className="flex items-center gap-2 py-1 pl-1 text-[11px] text-slate-400">
                <svg width="10" height="14" viewBox="0 0 10 14" className="shrink-0 text-slate-300">
                  <path d="M5 0 V10 M1 6 L5 11 L9 6" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="font-medium tabular-nums" style={{ color: s.conversionFromPrevious >= 50 ? '#059669' : '#e11d48' }}>
                  {s.conversionFromPrevious}%
                </span>
                <span>continued to {stageLabel(s.stage)}</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="w-24 shrink-0 text-[12.5px] font-medium text-slate-700">{stageLabel(s.stage)}</div>
              <div className="relative h-8 flex-1 rounded-lg bg-slate-50">
                <div
                  className="flex h-8 items-center justify-end rounded-lg px-3 transition-all duration-300 ease-out"
                  style={{ width: `${widthPct}%`, backgroundColor: ordinalStep(i, stages.length) }}
                >
                  <span className="text-[12px] font-semibold tabular-nums text-white">{formatCount(s.count)}</span>
                </div>
              </div>
              <div className="w-12 shrink-0 text-right text-[11px] tabular-nums text-slate-400">{s.conversionFromStart}%</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
