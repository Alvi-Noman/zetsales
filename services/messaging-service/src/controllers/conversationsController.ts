import type { Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../utils/db.js';
import { decryptSecret } from '../utils/crypto.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import type { ConversationDTO, MessageDTO } from '@zetsales/shared';
import { sendMessage } from '../integrations/metaClient.js';

function toConversationDto(doc: any): ConversationDTO {
  return {
    id: doc._id.toString(),
    accountId: doc.accountId,
    provider: doc.provider,
    accountName: doc.accountName,
    participantId: doc.participantId,
    participantName: doc.participantName,
    participantAvatar: doc.participantAvatar,
    lastMessageAt: new Date(doc.lastMessageAt).toISOString(),
    lastMessagePreview: doc.lastMessagePreview,
    unreadCount: doc.unreadCount ?? 0,
    status: doc.status,
  };
}

function toMessageDto(doc: any): MessageDTO {
  return {
    id: doc._id.toString(),
    conversationId: doc.conversationId,
    direction: doc.direction,
    text: doc.text,
    attachments: doc.attachments ?? [],
    sentAt: new Date(doc.sentAt).toISOString(),
  };
}

export async function listConversations(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const { accountId, status } = req.query as { accountId?: string; status?: string };
  const filter: Record<string, unknown> = { tenantId: req.user!.tenantId };
  if (accountId) filter.accountId = accountId;
  if (status) filter.status = status;

  const conversations = await db.collection('conversations').find(filter).sort({ lastMessageAt: -1 }).limit(200).toArray();
  res.json({ success: true, conversations: conversations.map(toConversationDto) });
}

export async function listMessages(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const conversation = await db
    .collection('conversations')
    .findOne({ _id: new ObjectId(req.params.conversationId), tenantId: req.user!.tenantId });
  if (!conversation) {
    res.status(404).json({ success: false, message: 'Conversation not found' });
    return;
  }

  await db.collection('conversations').updateOne({ _id: conversation._id }, { $set: { unreadCount: 0 } });

  const messages = await db
    .collection('messages')
    .find({ conversationId: conversation._id.toString() })
    .sort({ sentAt: 1 })
    .limit(500)
    .toArray();

  res.json({ success: true, messages: messages.map(toMessageDto) });
}

export async function replyToConversation(req: AuthenticatedRequest, res: Response) {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const imageUrl = typeof req.body?.imageUrl === 'string' ? req.body.imageUrl.trim() : '';
  if (!text && !imageUrl) {
    res.status(400).json({ success: false, message: 'Message text or an image is required' });
    return;
  }

  const db = getDb();
  const conversation = await db
    .collection('conversations')
    .findOne({ _id: new ObjectId(req.params.conversationId), tenantId: req.user!.tenantId });
  if (!conversation) {
    res.status(404).json({ success: false, message: 'Conversation not found' });
    return;
  }

  const account = await db.collection('social_accounts').findOne({ _id: new ObjectId(conversation.accountId) });
  if (!account) {
    res.status(409).json({ success: false, message: 'The account this conversation belongs to is no longer connected.' });
    return;
  }

  try {
    // A Send API message holds either text or one attachment, never both — an image wins if a
    // (buggy) caller somehow sends both.
    const payload = imageUrl ? ({ imageUrl } as const) : ({ text } as const);
    const providerMessageId = await sendMessage(account.externalId, decryptSecret(account.accessToken), conversation.participantId, payload);
    const now = new Date();
    const messageText = imageUrl ? '' : text;
    const attachments = imageUrl ? [imageUrl] : [];

    const result = await db.collection('messages').insertOne({
      tenantId: req.user!.tenantId,
      conversationId: conversation._id.toString(),
      direction: 'out',
      text: messageText,
      attachments,
      providerMessageId,
      sentAt: now,
    });

    await db.collection('conversations').updateOne(
      { _id: conversation._id },
      { $set: { lastMessageAt: now, lastMessagePreview: imageUrl ? '📷 Photo' : text, unreadCount: 0, status: 'open' } }
    );

    res.json({
      success: true,
      message: toMessageDto({ _id: result.insertedId, conversationId: conversation._id.toString(), direction: 'out', text: messageText, attachments, sentAt: now }),
    });
  } catch (err) {
    res.status(502).json({ success: false, message: 'Could not deliver this reply. The connection to Facebook/Instagram may need to be reconnected.' });
  }
}
