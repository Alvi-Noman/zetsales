// Best-effort district detection from an order's free-text address — ZetSales has no structured
// city/district field on an order (same limitation zoneDetection.ts documents for its coarser
// inside/outside/suburb tiers), so this is keyword matching against the address string, not a real
// geocode. Word-boundary regex, not plain substring, to avoid short names false-matching inside
// unrelated words. An address matching none of these returns null (bucketed as "Unknown" by the
// caller) rather than guessing — same "don't silently misattribute" principle as zoneDetection.ts.
export const BANGLADESH_DISTRICTS = [
  'Bagerhat', 'Bandarban', 'Barguna', 'Barishal', 'Bhola', 'Bogura', 'Brahmanbaria', 'Chandpur',
  'Chattogram', 'Chuadanga', "Cox's Bazar", 'Cumilla', 'Dhaka', 'Dinajpur', 'Faridpur', 'Feni',
  'Gaibandha', 'Gazipur', 'Gopalganj', 'Habiganj', 'Jamalpur', 'Jashore', 'Jhalokati', 'Jhenaidah',
  'Joypurhat', 'Khagrachhari', 'Khulna', 'Kishoreganj', 'Kurigram', 'Kushtia', 'Lakshmipur',
  'Lalmonirhat', 'Madaripur', 'Magura', 'Manikganj', 'Meherpur', 'Moulvibazar', 'Munshiganj',
  'Mymensingh', 'Naogaon', 'Narail', 'Narayanganj', 'Narsingdi', 'Natore', 'Chapainawabganj',
  'Netrokona', 'Nilphamari', 'Noakhali', 'Pabna', 'Panchagarh', 'Patuakhali', 'Pirojpur', 'Rajbari',
  'Rajshahi', 'Rangamati', 'Rangpur', 'Satkhira', 'Shariatpur', 'Sherpur', 'Sirajganj', 'Sunamganj',
  'Sylhet', 'Tangail', 'Thakurgaon',
] as const;

// A few common alternate spellings/aliases seen in real customer-typed addresses, mapped to the
// canonical name above. Checked before the plain district list so e.g. "chittagong" resolves to
// "Chattogram" instead of falling through to Unknown.
const ALIASES: Record<string, string> = {
  chittagong: 'Chattogram',
  chattagram: 'Chattogram',
  barisal: 'Barishal',
  jessore: 'Jashore',
  comilla: 'Cumilla',
  bogra: 'Bogura',
  coxsbazar: "Cox's Bazar",
  'cox bazar': "Cox's Bazar",
  nawabganj: 'Chapainawabganj',
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/['’]/g, '');
}

const districtPatterns = BANGLADESH_DISTRICTS.map((name) => ({
  name,
  regex: new RegExp(`\\b${normalize(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
}));
const aliasPatterns = Object.entries(ALIASES).map(([alias, name]) => ({
  name,
  regex: new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
}));

export function detectDistrict(address: string | null | undefined): string | null {
  if (!address) return null;
  const normalized = normalize(address);
  for (const { name, regex } of aliasPatterns) if (regex.test(normalized)) return name;
  for (const { name, regex } of districtPatterns) if (regex.test(normalized)) return name;
  return null;
}
