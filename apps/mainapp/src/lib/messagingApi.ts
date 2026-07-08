import type { ConversationDTO, MessageDTO, SocialAccountDTO } from '@zetsales/shared';
import { api } from './api';

export async function getMessagingCapabilities() {
  const res = await api.get('/messaging/capabilities');
  return res.data as { success: boolean; metaAppConfigured: boolean };
}

export async function listSocialAccounts() {
  const res = await api.get('/messaging/accounts');
  return res.data.accounts as SocialAccountDTO[];
}

export async function removeSocialAccount(accountId: string) {
  await api.delete(`/messaging/accounts/${accountId}`);
}

export function facebookOAuthStartUrl() {
  return '/api/v1/messaging/accounts/facebook/oauth/start';
}

export interface ListConversationsParams {
  accountId?: string;
  status?: 'open' | 'closed';
}

export async function listConversations(params: ListConversationsParams = {}) {
  const res = await api.get('/messaging/conversations', { params });
  return res.data.conversations as ConversationDTO[];
}

export async function listMessages(conversationId: string) {
  const res = await api.get(`/messaging/conversations/${conversationId}/messages`);
  return res.data.messages as MessageDTO[];
}

export async function sendReply(conversationId: string, payload: { text: string } | { imageUrl: string }) {
  const res = await api.post(`/messaging/conversations/${conversationId}/messages`, payload);
  return res.data.message as MessageDTO;
}

export async function uploadMessagingImage(file: File) {
  const form = new FormData();
  form.append('image', file);
  const res = await api.post('/messaging/uploads', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return res.data.url as string;
}
