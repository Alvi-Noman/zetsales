import crypto from 'crypto';

// AES-256-GCM encryption for store credentials (Shopify access tokens, WooCommerce consumer
// secrets, etc.) at rest. STORE_CREDENTIALS_SECRET must be 32+ chars; we derive a fixed-length
// key from it via SHA-256 so any reasonably long passphrase works.
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

export function maskSecret(value: string, visible = 4): string {
  if (value.length <= visible) return '••••';
  return `••••${value.slice(-visible)}`;
}

// Scrypt (not bcrypt) so HRM's PIN hashing doesn't need its own bcrypt dependency in this
// service — auth-service's user passwords use bcryptjs, this is a separate, much shorter secret
// (a 4-6 digit punch PIN) with its own salt-per-hash scheme.
const PIN_KEY_LENGTH = 64;

export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(pin, salt, PIN_KEY_LENGTH).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(pin, salt, PIN_KEY_LENGTH);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}
