// Canonical form for a Bangladeshi mobile number: 11 digits, "01XXXXXXXXX". +8801XXXXXXXXX,
// 8801XXXXXXXXX, 01XXXXXXXXX, and spaced/dashed variants all normalize to the same key — without
// this, the same customer's courier history would fragment across whichever format happened to be
// captured on a given order.
export function normalizeBdPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('01')) return digits;
  if (digits.length === 13 && digits.startsWith('880')) return `0${digits.slice(3)}`;
  return null;
}
