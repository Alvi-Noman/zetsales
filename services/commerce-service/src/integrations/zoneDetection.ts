import type { CourierZoneTier } from '@zetsales/shared';

// Best-effort keyword match on the order's free-text address — couriers don't expose a
// geocoding API, and orders don't carry a structured city/district field, so this is the only
// signal available at order-creation time. Unmatched addresses default to 'outside' (typically
// couriers' most expensive tier), so an unrecognized address undercounts expected cost rather
// than overstating what a courier owes back. Staff can correct the result in the order drawer
// before the parcel actually dispatches.
const INSIDE_DHAKA_KEYWORDS = [
  'dhanmondi', 'gulshan', 'banani', 'mirpur', 'mohammadpur', 'uttara', 'motijheel', 'bashundhara',
  'badda', 'rampura', 'khilgaon', 'jatrabari', 'wari', 'tejgaon', 'farmgate', 'panthapath',
  'malibagh', 'shyamoli', 'kalabagan', 'lalbagh', 'demra', 'kafrul', 'cantonment', 'banasree',
  'aftabnagar', 'mohakhali', 'shahbagh', 'paltan', 'segunbagicha', 'nikunja', 'baridhara',
  'khilkhet', 'shantinagar', 'elephant road', 'new market', 'azimpur', 'hazaribagh', 'dhaka',
];

const SUBURB_KEYWORDS = [
  'savar', 'gazipur', 'narayanganj', 'keraniganj', 'tongi', 'ashulia', 'konabari', 'kaliakair',
];

export function detectZoneTier(address: string): CourierZoneTier {
  const normalized = address.toLowerCase();
  if (SUBURB_KEYWORDS.some((kw) => normalized.includes(kw))) return 'suburb';
  if (INSIDE_DHAKA_KEYWORDS.some((kw) => normalized.includes(kw))) return 'inside';
  return 'outside';
}
