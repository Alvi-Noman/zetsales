// Builds a normalized SVG polyline from a series of numbers, scaled to fit a viewBox of
// `width` x `height` — used for the tiny sparkline charts in the stats row.
export function sparklinePoints(values: number[], width = 100, height = 28): string {
  if (values.length === 0) return '';
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : 0;

  return values
    .map((v, i) => {
      const x = step * i;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function formatCompactCurrency(value: number, currency = '৳'): string {
  if (Math.abs(value) >= 1_000_000) return `${currency}${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${currency}${(value / 1_000).toFixed(1)}K`;
  return `${currency}${value.toLocaleString()}`;
}

export function trendPercent(series: number[]): number | null {
  if (series.length < 2) return null;
  const mid = Math.floor(series.length / 2);
  const firstHalf = series.slice(0, mid).reduce((a, b) => a + b, 0);
  const secondHalf = series.slice(mid).reduce((a, b) => a + b, 0);
  if (firstHalf === 0) return secondHalf > 0 ? 100 : null;
  return Math.round(((secondHalf - firstHalf) / firstHalf) * 100);
}
