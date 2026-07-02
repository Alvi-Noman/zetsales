// Compact "how long ago" label for table rows — full precision is available via the `title`
// tooltip on the element that renders this, so nothing is lost, just de-emphasized.
export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// "Jun 23, 10:24 AM" — the primary line in the table's two-line date cell.
export function formatAbsoluteDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

// "Today" / "Yesterday" / "3 days ago" / a plain date once it's old enough that "N days ago"
// stops being a useful anchor — the secondary, de-emphasized line under the absolute timestamp.
export function relativeDayLabel(iso: string): string {
  const target = new Date(iso);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(target)) / 86_400_000);
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff > 1 && dayDiff < 7) return `${dayDiff} days ago`;
  return target.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ageMinutes(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}

// A compact duration for "oldest waiting" style subtext (no "ago" suffix, no seconds).
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export type Urgency = 'normal' | 'warn' | 'critical';

// COD conversion drops the longer a Pending/Flagged order sits uncalled — these thresholds are
// what the "needs action" KPI and the row-age styling both key off of.
export function pendingUrgency(minutes: number): Urgency {
  if (minutes >= 8 * 60) return 'critical';
  if (minutes >= 2 * 60) return 'warn';
  return 'normal';
}
