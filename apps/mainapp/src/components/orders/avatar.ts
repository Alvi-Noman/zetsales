const AVATAR_COLORS = ['bg-indigo-500', 'bg-violet-500', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500'];

// Deterministic color + initials from a name, so the same customer always gets the same avatar
// across the table, the drawer, and the command palette without storing anything extra.
export function avatarFromName(name: string | null) {
  const label = (name || '?').trim();
  const initials =
    label
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  return { initials, color: AVATAR_COLORS[hash % AVATAR_COLORS.length] };
}
