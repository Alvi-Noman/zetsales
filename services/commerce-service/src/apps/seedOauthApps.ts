import crypto from 'crypto';
import { getDb } from '../utils/db.js';
import logger from '../utils/logger.js';

// Idempotent — upserts the oauth_apps row each of ZetSales's own oauth-type standalone services
// needs to complete the OAuth 2.0 install flow (GET /oauth/authorize -> POST /oauth/access_token).
// Both sides (this seed, and the standalone service's own env) read the same
// ADS_APP_CLIENT_ID/ADS_APP_CLIENT_SECRET values from docker-compose, so there's no discovery
// step — they simply agree on the same credentials.
export async function seedOauthApps() {
  const clientId = process.env.ADS_APP_CLIENT_ID;
  const clientSecret = process.env.ADS_APP_CLIENT_SECRET;
  const publicAdsUrl = process.env.PUBLIC_ADS_URL || 'http://localhost:8081/api/v1/ads';
  if (!clientId || !clientSecret) {
    logger.warn('[seedOauthApps] ADS_APP_CLIENT_ID/SECRET not set — skipping zetSalesAds oauth_apps seed');
    return;
  }

  await getDb().collection('oauth_apps').updateOne(
    { appKey: 'zetSalesAds' },
    {
      $set: {
        appKey: 'zetSalesAds',
        clientId,
        clientSecretHash: crypto.createHash('sha256').update(clientSecret).digest('hex'),
        redirectUris: [`${publicAdsUrl}/oauth/callback`],
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );
  logger.info('[seedOauthApps] zetSalesAds oauth_apps entry ensured');
}
