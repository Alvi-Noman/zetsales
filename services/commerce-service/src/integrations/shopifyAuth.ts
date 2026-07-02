import { ObjectId } from 'mongodb';
import { getDb } from '../utils/db.js';
import { decryptSecret, encryptSecret } from '../utils/crypto.js';
import { exchangeShopifyClientCredentials } from './shopifyClient.js';

// Legacy custom apps (pre-2026) and the classic OAuth authorization-code grant both issue
// long-lived tokens we can just decrypt and use. Dev Dashboard custom apps (2026+) authenticate
// via client_credentials instead, which expire every ~24h — this refreshes and persists a new
// one when the cached token is stale, so callers never have to think about the difference.
export async function getValidShopifyAccessToken(store: any): Promise<string> {
  const creds = store.credentials;

  if (creds.authMethod !== 'client-credentials') {
    return decryptSecret(creds.accessToken);
  }

  const expiresAt = creds.tokenExpiresAt ? new Date(creds.tokenExpiresAt).getTime() : 0;
  const stillValid = expiresAt - Date.now() > 5 * 60 * 1000; // 5 minute safety buffer
  if (stillValid) {
    return decryptSecret(creds.accessToken);
  }

  const clientId = decryptSecret(creds.clientId);
  const clientSecret = decryptSecret(creds.clientSecret);
  const { accessToken, expiresInSeconds } = await exchangeShopifyClientCredentials(store.shopDomain, clientId, clientSecret);

  const db = getDb();
  await db.collection('stores').updateOne(
    { _id: new ObjectId(store._id) },
    {
      $set: {
        'credentials.accessToken': encryptSecret(accessToken),
        'credentials.tokenExpiresAt': new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      },
    }
  );

  return accessToken;
}
