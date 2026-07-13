import crypto from 'crypto';
import type { AppWebhookTopic } from '@zetsales/shared';
import { getDb } from './db.js';
import { decryptSecret } from './crypto.js';
import logger from './logger.js';

async function post(url: string, body: string, signature: string): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-ZetSales-Hmac-Sha256': signature },
    body,
  });
  if (!res.ok) throw new Error(`webhook delivery failed: ${res.status}`);
}

// Outbound webhook delivery to installed apps — no persistent queue, fire-and-forget with a
// single retry. A disclosed Phase-1 simplification: a delivery lost to a transient failure past
// the one retry is simply dropped, same convention as other documented simplifications in this
// codebase (see SlaBreachDTO).
export async function dispatchAppWebhook(tenantId: string, topic: AppWebhookTopic, payload: unknown): Promise<void> {
  const subscribers = await getDb()
    .collection('installed_apps')
    .find({ tenantId, status: 'installed', subscribedTopics: topic, webhookUrl: { $ne: null } })
    .toArray();

  for (const app of subscribers) {
    if (!app.webhookUrl || !app.webhookSecret) continue;
    const body = JSON.stringify({ topic, payload, timestamp: new Date().toISOString() });
    const secret = decryptSecret(app.webhookSecret);
    // Mirrors verifyHmac in webhooksController.ts exactly — same base64 HMAC-SHA256 digest
    // convention Shopify itself uses for X-Shopify-Hmac-Sha256, just outbound instead of inbound.
    const signature = crypto.createHmac('sha256', secret).update(body).digest('base64');

    post(app.webhookUrl, body, signature).catch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      post(app.webhookUrl, body, signature).catch((err) => logger.error(`[appEvents] webhook delivery failed for ${app.appKey}/${topic}: ${err.message}`));
    });
  }
}
