// Categorical palette: 8 hues in a fixed order, validated for CVD-safe adjacent separation
// (min ΔE 52.6, protanopia) against a white chart surface via the dataviz skill's validator.
// Never reorder or cycle past slot 8 — fold overflow categories into "Other" instead. Three slots
// (emerald, orange, teal, dark-amber) sit below 3:1 contrast on white by design, so every chart
// using this palette must also carry visible direct labels or a table view (the relief channel),
// never color alone.
export const CATEGORICAL_PALETTE = [
  '#10b981', // emerald
  '#3b82f6', // blue
  '#f97316', // orange
  '#8b5cf6', // violet
  '#f43f8e', // rose
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#ca8a04', // dark amber
] as const;

export function categoricalColor(index: number): string {
  return CATEGORICAL_PALETTE[index % CATEGORICAL_PALETTE.length];
}

// Single-hue ordinal ramp (indigo) for ordered sequences where position carries meaning — funnel
// stages, day/hour heatmap intensity. Monotone lightness, light end still >= 2:1 on white.
export const ORDINAL_RAMP = ['#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3'] as const;

export function ordinalStep(index: number, count: number): string {
  if (count <= 1) return ORDINAL_RAMP[ORDINAL_RAMP.length - 1];
  const t = index / (count - 1);
  const pos = Math.round(t * (ORDINAL_RAMP.length - 1));
  return ORDINAL_RAMP[Math.min(ORDINAL_RAMP.length - 1, Math.max(0, pos))];
}

// Sequential ramp (0-1 magnitude -> hex) for the heatmap grid — one hue, light-to-dark.
const SEQUENTIAL_STEPS = ['#eef2ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#3730a3'] as const;
export function sequentialColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const idx = Math.round(clamped * (SEQUENTIAL_STEPS.length - 1));
  return SEQUENTIAL_STEPS[idx];
}

// Fixed, reserved meaning — never reused for "series N". Paired with an icon/label wherever used,
// never color alone (matches the up/down convention already used across Home/Orders).
export const STATUS = {
  good: '#059669', // emerald-600
  bad: '#e11d48', // rose-600
  neutral: '#94a3b8', // slate-400
} as const;

export const CHART_INK = {
  primary: '#0f172a', // slate-900
  secondary: '#475569', // slate-600
  muted: '#94a3b8', // slate-400
  grid: '#f1f5f9', // slate-100
  baseline: '#e2e8f0', // slate-200
} as const;
