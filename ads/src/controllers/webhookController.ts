import type { Request, Response } from 'express';
import crypto from 'crypto';
import { getDb } from '../utils/db.js';
import { decryptSecret } from '../utils/crypto.js';
import logger from '../utils/logger.js';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

// Proves commerce-service's outbound dispatchAppWebhook mechanism actually delivers — the first
// real subscriber any oauth-type app has ever registered (see installController.ts). The
// payload itself carries no tenantId (dispatchAppWebhook's body shape is {topic, payload,
// timestamp}), so the signature is checked against every installed tenant's own webhookSecret;
// fine at today's install count, same disclosed-simplification convention as dispatchAppWebhook's
// own "no persistent queue" note.
export async function inbound(req: RawBodyRequest, res: Response) {
  const signature = req.headers['x-zetsales-hmac-sha256'] as string | undefined;
  const rawBody = req.rawBody;
  if (!signature || !rawBody) {
    res.status(400).json({ success: false });
    return;
  }

  const installs = await getDb().collection('ads_installs').find({ webhookSecret: { $ne: null } }).toArray();
  let matchedTenantId: string | null = null;
  for (const install of installs) {
    const secret = decryptSecret(install.webhookSecret);
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    const expectedBuf = Buffer.from(expected);
    const signatureBuf = Buffer.from(signature);
    if (expectedBuf.length === signatureBuf.length && crypto.timingSafeEqual(expectedBuf, signatureBuf)) {
      matchedTenantId = install.tenantId;
      break;
    }
  }
  if (!matchedTenantId) {
    res.status(401).json({ success: false });
    return;
  }

  const { topic, payload } = (req.body ?? {}) as { topic?: string; payload?: unknown };
  await getDb().collection('ads_webhook_events').insertOne({ tenantId: matchedTenantId, topic, payload, receivedAt: new Date() });
  logger.info(`[webhook] received ${topic} for tenant ${matchedTenantId}`);
  res.status(200).json({ success: true });
}
