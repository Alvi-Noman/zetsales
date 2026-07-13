import crypto from 'crypto';

// Ported from services/commerce-service/src/utils/crypto.ts — deliberately using the SAME
// STORE_CREDENTIALS_SECRET env var (shared via docker-compose) so tokens this service writes
// into the shared `adAccounts` collection stay decryptable by commerce-service's
// adCampaignsController.ts later.
const RAW_SECRET = process.env.STORE_CREDENTIALS_SECRET || 'dev-store-credentials-secret-change-me';
const KEY = crypto.createHash('sha256').update(RAW_SECRET).digest();

export function encryptSecret(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join('.');
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed encrypted payload');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}
