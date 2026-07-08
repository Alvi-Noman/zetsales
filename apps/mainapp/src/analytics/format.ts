export const formatMoney = (v: number) => `৳${Math.round(v).toLocaleString()}`;
export const formatCount = (v: number) => Math.round(v).toLocaleString();
export const formatPercent = (v: number) => `${v.toFixed(1)}%`;
export const formatPercentRounded = (v: number) => `${Math.round(v)}%`;

export function formatMinutes(minutes: number | null): string {
  if (minutes == null) return '—';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours < 24) return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days}d ${restHours}h` : `${days}d`;
}

export function formatHours(hours: number | null): string {
  if (hours == null) return '—';
  return formatMinutes(hours * 60);
}
