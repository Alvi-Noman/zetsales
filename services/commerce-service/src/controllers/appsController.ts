import type { Response } from 'express';
import crypto from 'crypto';
import { ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';
import { env } from '@zetsales/config/validateEnv';
import type { AppExtensionTarget, AppWebhookTopic, InstalledAppDTO } from '@zetsales/shared';
import { APP_WEBHOOK_TOPICS } from '@zetsales/shared';
import { getDb } from '../utils/db.js';
import { encryptSecret } from '../utils/crypto.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import type { AppAuthenticatedRequest } from '../middleware/appAuthMiddleware.js';
import { APP_MANIFESTS, getAppManifest } from '../apps/registry.js';

export async function listApps(req: AuthenticatedRequest, res: Response) {
  const installed = await getDb()
    .collection('installed_apps')
    .find({ tenantId: req.user!.tenantId, status: 'installed' })
    .toArray();
  const installedByKey = new Map(installed.map((i) => [i.appKey, i]));

  const apps = APP_MANIFESTS.map((manifest) => {
    const record = installedByKey.get(manifest.key);
    const status: InstalledAppDTO | null = record
      ? { appKey: manifest.key, status: 'installed', installedAt: record.installedAt?.toISOString?.() ?? new Date(0).toISOString() }
      : null;
    return { manifest, install: status };
  });
  res.status(200).json({ success: true, apps });
}

// Embedded-type apps install/uninstall instantly (a plain flag flip, same as last session's
// simple toggle). oauth-type apps don't use this endpoint at all — the App Store's Install
// button links straight to GET /oauth/authorize instead (installation *is* the OAuth flow).
export async function installApp(req: AuthenticatedRequest, res: Response) {
  const manifest = getAppManifest(req.params.appKey);
  if (!manifest) {
    res.status(404).json({ success: false, message: 'Unknown app' });
    return;
  }
  if (manifest.authType !== 'embedded') {
    res.status(400).json({ success: false, message: 'This app installs via OAuth — use GET /oauth/authorize' });
    return;
  }

  const tenantId = req.user!.tenantId!;
  await getDb().collection('installed_apps').updateOne(
    { tenantId, appKey: manifest.key },
    { $set: { status: 'installed', updatedAt: new Date() }, $setOnInsert: { tenantId, appKey: manifest.key, installedAt: new Date(), scopes: [], subscribedTopics: [] } },
    { upsert: true }
  );
  await getDb().collection('businesses').updateOne({ _id: new ObjectId(tenantId) }, { $addToSet: { installedPlugins: manifest.key } });

  res.status(200).json({ success: true });
}

export async function uninstallApp(req: AuthenticatedRequest, res: Response) {
  const manifest = getAppManifest(req.params.appKey);
  if (!manifest) {
    res.status(404).json({ success: false, message: 'Unknown app' });
    return;
  }
  const tenantId = req.user!.tenantId!;
  await getDb()
    .collection('installed_apps')
    .updateOne({ tenantId, appKey: manifest.key }, { $set: { status: 'revoked', accessTokenHash: null, uninstalledAt: new Date() } });
  await getDb()
    .collection('businesses')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .updateOne({ _id: new ObjectId(tenantId) }, { $pull: { installedPlugins: manifest.key } } as any);

  res.status(200).json({ success: true });
}

// An installed oauth-type app registers where its outbound webhooks should go, and which topics
// it wants — authenticated via the access token it received from POST /oauth/access_token, not
// the merchant's own session.
export async function registerWebhook(req: AppAuthenticatedRequest, res: Response) {
  const { webhookUrl, topics } = (req.body ?? {}) as { webhookUrl?: string; topics?: string[] };
  if (!webhookUrl || !Array.isArray(topics)) {
    res.status(400).json({ success: false, message: 'webhookUrl and topics are required' });
    return;
  }
  const subscribedTopics = topics.filter((t): t is AppWebhookTopic => (APP_WEBHOOK_TOPICS as readonly string[]).includes(t));
  const webhookSecret = crypto.randomBytes(24).toString('hex');

  await getDb().collection('installed_apps').updateOne(
    { tenantId: req.installedApp!.tenantId, appKey: req.installedApp!.appKey },
    { $set: { webhookUrl, webhookSecret: encryptSecret(webhookSecret), subscribedTopics, updatedAt: new Date() } }
  );
  res.status(200).json({ success: true, webhookSecret });
}

// Mints a short-lived session token for an AppBlock iframe (see apps/mainapp's AppBlock.tsx) —
// App Bridge's own term for this concept. Session-authenticated: only the merchant's own logged-
// in browser can request one, scoped to the specific extension context (e.g. an orderId).
export async function createSessionToken(req: AuthenticatedRequest, res: Response) {
  const manifest = getAppManifest(req.params.appKey);
  if (!manifest || manifest.authType !== 'oauth') {
    res.status(404).json({ success: false, message: 'Unknown or non-embeddable app' });
    return;
  }
  const target = req.body?.target as AppExtensionTarget | undefined;
  const context = (req.body?.context ?? {}) as Record<string, unknown>;

  const sessionToken = jwt.sign(
    { tenantId: req.user!.tenantId, userId: req.user!.id, role: req.user!.role, appKey: manifest.key, target, ...context },
    env.JWT_SECRET,
    { expiresIn: '60s' }
  );
  res.status(200).json({ success: true, sessionToken });
}
