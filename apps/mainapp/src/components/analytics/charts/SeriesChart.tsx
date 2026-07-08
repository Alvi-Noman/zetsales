import type { AnalyticsSeriesDTO, AnalyticsSeriesWindowDTO } from '@zetsales/shared';
import { TrendChart } from '../../orders/TrendChart';

function toChartPoints(window: AnalyticsSeriesWindowDTO) {
  return window.points.map((p) => ({ index: p.index, label: p.label, date: p.date, value: p.value }));
}

interface SeriesChartProps {
  series: AnalyticsSeriesDTO;
  color: string;
  formatValue: (v: number) => string;
  height?: number;
}

// Every "X over time" analytics card (sales, AOV, gross profit, discounts, COD cashflow) shares
// this exact shape, so it reuses the same TrendChart already shipping on Home/Orders instead of a
// second bespoke line chart implementation.
export function SeriesChart({ series, color, formatValue, height }: SeriesChartProps) {
  return <TrendChart current={toChartPoints(series.current)} comparison={toChartPoints(series.comparison)} color={color} formatValue={formatValue} height={height} />;
}
