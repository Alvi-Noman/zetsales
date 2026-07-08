import type { Request, Response } from 'express';
import { getDb } from '../utils/db.js';
import { decryptSecret } from '../utils/crypto.js';
import logger from '../utils/logger.js';
import { verifyMetaSignature, fetchParticipantProfile } from '../integrations/metaClient.js';

export function metaWebhookVerify(req: Request, res: Response) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    return;
  }
  res.sendStatus(403);
}

interface MetaMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: { mid: string; text?: string; is_echo?: boolean; attachments?: Array<{ payload?: { url?: string } }> };
}

interface MetaWebhookBody {
  object: 'page' | 'instagram';
  entry: Array<{ id: string; messaging?: MetaMessagingEvent[] }>;
}

export async function metaWebhookReceive(req: Request, res: Response) {
  // Ack immediately — Meta retries aggressively on anything but a fast 200, and processing
  // happens independently of that ack.
  res.sendStatus(200);

  const appSecret = process.env.META_APP_SECRET;
  const signature = req.header('X-Hub-Signature-256');
  const rawBody = req.body as Buffer;

  if (!appSecret || !verifyMetaSignature(rawBody, signature, appSecret)) {
    logger.warn('[meta webhook] Rejected: invalid or missing signature');
    return;
  }

  let payload: MetaWebhookBody;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    logger.warn('[meta webhook] Rejected: malformed JSON body');
    return;
  }

  const provider = payload.object === 'instagram' ? 'instagram' : 'facebook';
  const db = getDb();

  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      if (!event.message || event.message.is_echo) continue; // echoes of our own sends, ignore

      const account = await db.collection('social_accounts').findOne({ provider, externalId: entry.id });
      if (!account) {
        logger.warn(`[meta webhook] No account on file for ${provider}:${entry.id}, dropping event`);
        continue;
      }

      await ingestMessage(account, event).catch((err) =>
        logger.error(`[meta webhook] Failed to ingest message for ${provider}:${entry.id}: ${(err as Error).message}`)
      );
    }
  }
}

async function ingestMessage(account: any, event: MetaMessagingEvent) {
  const db = getDb();
  const participantId = event.sender.id;
  const text = event.message?.text ?? '';
  const attachments = (event.message?.attachments ?? []).map((a) => a.payload?.url).filter((u): u is string => Boolean(u));
  const sentAt = new Date(event.timestamp);

  let conversation = await db.collection('conversations').findOne({ accountId: account._id.toString(), participantId });

  if (!conversation) {
    const profile = await fetchParticipantProfile(participantId, decryptSecret(account.accessToken));
    const result = await db.collection('conversations').insertOne({
      tenantId: account.tenantId,
      accountId: account._id.toString(),
      provider: account.provider,
      accountName: account.name,
      participantId,
      participantName: profile.name ?? 'Customer',
      participantAvatar: profile.avatar,
      lastMessageAt: sentAt,
      lastMessagePreview: text,
      unreadCount: 1,
      status: 'open',
    });
    conversation = { _id: result.insertedId };
  } else {
    await db.collection('conversations').updateOne(
      { _id: conversation._id },
      { $set: { lastMessageAt: sentAt, lastMessagePreview: text, status: 'open' }, $inc: { unreadCount: 1 } }
    );
  }

  await db.collection('messages').updateOne(
    { providerMessageId: event.message!.mid },
    {
      $setOnInsert: {
        tenantId: account.tenantId,
        conversationId: conversation._id.toString(),
        direction: 'in',
        text,
        attachments,
        providerMessageId: event.message!.mid,
        sentAt,
      },
    },
    { upsert: true }
  );
}
