import crypto from 'crypto';

// AES-256-GCM encryption for Page access tokens at rest, same scheme as commerce-service's
// store credentials (see services/commerce-service/src/utils/crypto.ts). MESSAGING_CREDENTIALS_SECRET
// must be 32+ chars; we derive a fixed-length key from it via SHA-256 so any reasonably long
// passphrase works.
const RAW_SECRET = process.env.MESSAGING_CREDENTIALS_SECRET || 'dev-messaging-credentials-secret-change-me';
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
