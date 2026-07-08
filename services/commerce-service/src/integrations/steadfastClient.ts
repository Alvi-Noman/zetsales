import logger from '../utils/logger.js';

// Steadfast's API is hosted under their "Packzy" platform domain, not steadfast.com.bd itself —
// portal.steadfast.com.bd no longer resolves (confirmed 2026-07), portal.packzy.com is the live host.
const BASE_URL = 'https://portal.packzy.com/api/v1';

export interface SteadfastCredentials {
  apiKey: string;
  secretKey: string;
}

function authHeaders(creds: SteadfastCredentials): Record<string, string> {
  return { 'Api-Key': creds.apiKey, 'Secret-Key': creds.secretKey, 'Content-Type': 'application/json' };
}

// Cheap read-only call used purely to confirm a pair of keys actually works before we save them —
// mirrors Steadfast's published "get current balance" endpoint, which has no side effects.
export async function verifySteadfastCredentials(creds: SteadfastCredentials): Promise<void> {
  const res = await fetch(`${BASE_URL}/get_balance`, { headers: authHeaders(creds) });
  const body: any = await res.json().catch(() => null);
  if (!res.ok || body?.status !== 200) {
    logger.warn(`[steadfast] credential check failed (status ${res.status}): ${JSON.stringify(body)}`);
    throw new Error(body?.message || 'Steadfast rejected these API credentials. Check the API key and secret key.');
  }
}

interface CreateConsignmentInput {
  invoice: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  codAmount: number;
  note?: string;
}

interface CreateConsignmentResult {
  consignmentId: string;
  trackingCode: string;
}

// Hands a Shipped order to Steadfast for delivery, using the credentials the merchant connected
// under Integrations → Courier Integration (see couriersController.ts). Response shape follows
// Steadfast's published API docs, not a verified live response.
export async function createSteadfastConsignment(creds: SteadfastCredentials, input: CreateConsignmentInput): Promise<CreateConsignmentResult> {
  const res = await fetch(`${BASE_URL}/create_order`, {
    method: 'POST',
    headers: authHeaders(creds),
    body: JSON.stringify({
      invoice: input.invoice,
      recipient_name: input.recipientName,
      recipient_phone: input.recipientPhone,
      recipient_address: input.recipientAddress,
      cod_amount: input.codAmount,
      note: input.note ?? '',
    }),
  });

  const body: any = await res.json().catch(() => null);
  if (!res.ok || !body?.consignment) {
    logger.warn(`[steadfast] createConsignment failed (status ${res.status}): ${JSON.stringify(body)}`);
    throw new Error(body?.message || 'Steadfast rejected the consignment request');
  }

  return { consignmentId: String(body.consignment.consignment_id), trackingCode: String(body.consignment.tracking_code) };
}
