import type { Response } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import type { AdAccountPlatform, AdCampaignDTO, AdCampaignPlatformStatusDTO } from '@zetsales/shared';
import { getDb } from '../utils/db.js';
import { decryptSecret } from '../utils/crypto.js';
import logger from '../utils/logger.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { refreshGoogleAccessToken, findPurchaseConversionAction, createPerformanceMaxCampaign, setCampaignStatus as setGoogleCampaignStatus } from '../integrations/googleAdsClient.js';

function campaignDto(doc: any): AdCampaignDTO {
  const platformDto = (p: any): AdCampaignPlatformStatusDTO | null =>
    p ? { adAccountId: p.adAccountId, status: p.status, externalCampaignId: p.externalCampaignId ?? null, error: p.error ?? null, updatedAt: new Date(p.updatedAt).toISOString() } : null;
  return {
    id: doc._id.toString(),
    name: doc.name,
    productId: doc.productId ?? null,
    productTitle: doc.productTitle ?? null,
    destinationUrl: doc.destinationUrl,
    goal: doc.goal,
    budgetAmount: doc.budgetAmount,
    budgetType: doc.budgetType,
    assetIds: doc.assetIds ?? [],
    headlines: doc.headlines ?? [],
    descriptions: doc.descriptions ?? [],
    primaryText: doc.primaryText ?? '',
    platforms: { meta: platformDto(doc.platforms?.meta), google: platformDto(doc.platforms?.google), tiktok: platformDto(doc.platforms?.tiktok) },
    createdBy: doc.createdBy ?? null,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

export async function listCampaigns(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const campaigns = await db.collection('adCampaigns').find({ tenantId: req.user!.tenantId }).sort({ createdAt: -1 }).toArray();
  res.json({ success: true, campaigns: campaigns.map(campaignDto) });
}

const createCampaignSchema = z.object({
  productId: z.string().trim().optional(),
  productTitle: z.string().trim().optional(),
  destinationUrl: z.string().trim().url(),
  goal: z.enum(['maximize_conversions', 'maximize_value']),
  budgetAmount: z.number().positive(),
  budgetType: z.enum(['daily', 'total']),
  assetIds: z.array(z.string()).default([]),
  headlines: z.array(z.string().trim().min(1)).min(3),
  descriptions: z.array(z.string().trim().min(1)).min(2),
  primaryText: z.string().trim().min(1),
  platforms: z.array(z.enum(['meta', 'google', 'tiktok'])).min(1),
  googleMarketingImageAssetId: z.string().trim().optional(),
  googleSquareImageAssetId: z.string().trim().optional(),
  googleLogoAssetId: z.string().trim().optional(),
  businessName: z.string().trim().optional(),
});

async function getConnectedAccount(tenantId: string, platform: AdAccountPlatform) {
  const db = getDb();
  return db.collection('adAccounts').findOne({ tenantId, platform, status: 'connected' });
}

// Runs Google Performance Max creation for one campaign — isolated so a Google failure never
// touches Meta/TikTok's own attempts (see createCampaign's Promise.allSettled fan-out).
async function launchOnGoogle(tenantId: string, campaignId: ObjectId, input: z.infer<typeof createCampaignSchema>) {
  const db = getDb();
  const account = await getConnectedAccount(tenantId, 'google');
  if (!account) {
    await db.collection('adCampaigns').updateOne(
      { _id: campaignId },
      { $set: { 'platforms.google': { adAccountId: '', status: 'failed', externalCampaignId: null, error: 'No connected Google Ads account.', updatedAt: new Date() } } }
    );
    return;
  }

  const setStatus = (patch: Record<string, unknown>) =>
    db.collection('adCampaigns').updateOne({ _id: campaignId }, { $set: { 'platforms.google': { adAccountId: account.externalAccountId, updatedAt: new Date(), ...patch } } });

  await setStatus({ status: 'creating', externalCampaignId: null, error: null });

  try {
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!;
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET!;
    const refreshToken = decryptSecret(account.credentials.refreshToken);
    const { accessToken } = await refreshGoogleAccessToken(clientId, clientSecret, refreshToken);

    const conversionAction = await findPurchaseConversionAction(accessToken, developerToken, account.externalAccountId);
    if (!conversionAction) {
      await setStatus({ status: 'failed', error: 'This Google Ads account has no enabled Purchase conversion action configured yet — Performance Max needs one to optimize toward.' });
      return;
    }

    if (!input.googleMarketingImageAssetId || !input.googleSquareImageAssetId || !input.googleLogoAssetId) {
      await setStatus({ status: 'failed', error: 'Google Performance Max needs a marketing image, a square image, and a logo assigned.' });
      return;
    }
    const assetDocs = await db
      .collection('adCreativeAssets')
      .find({ tenantId, _id: { $in: [input.googleMarketingImageAssetId, input.googleSquareImageAssetId, input.googleLogoAssetId].map((id) => new ObjectId(id)) } })
      .toArray();
    const pathById = new Map(assetDocs.map((a) => [a._id.toString(), a.localPath as string]));
    const marketingImagePath = pathById.get(input.googleMarketingImageAssetId);
    const squareImagePath = pathById.get(input.googleSquareImageAssetId);
    const logoPath = pathById.get(input.googleLogoAssetId);
    if (!marketingImagePath || !squareImagePath || !logoPath) {
      await setStatus({ status: 'failed', error: 'One or more selected Google image assets could not be found.' });
      return;
    }

    const { campaignResourceName } = await createPerformanceMaxCampaign(accessToken, developerToken, account.externalAccountId, {
      campaignName: `${input.productTitle ?? 'Campaign'} — Purchase — ${new Date().toISOString().slice(0, 10)}`,
      destinationUrl: input.destinationUrl,
      dailyBudgetAmount: input.budgetAmount,
      goal: input.goal,
      headlines: input.headlines,
      longHeadline: input.primaryText,
      descriptions: input.descriptions,
      businessName: input.businessName || 'Our Store',
      marketingImagePath,
      squareImagePath,
      logoPath,
    });

    await setStatus({ status: 'paused', externalCampaignId: campaignResourceName, error: null });
  } catch (err) {
    logger.warn(`[google ads campaign] creation failed: ${(err as Error).message}`);
    await setStatus({ status: 'failed', error: 'Could not create the Google Ads campaign. Check the connected account still has access.' });
  }
}

async function launchOnMeta(tenantId: string, campaignId: ObjectId) {
  const db = getDb();
  await db.collection('adCampaigns').updateOne(
    { _id: campaignId },
    { $set: { 'platforms.meta': { adAccountId: '', status: 'failed', externalCampaignId: null, error: 'Meta campaign creation is not built yet.', updatedAt: new Date() } } }
  );
}

async function launchOnTiktok(tenantId: string, campaignId: ObjectId) {
  const db = getDb();
  await db.collection('adCampaigns').updateOne(
    { _id: campaignId },
    { $set: { 'platforms.tiktok': { adAccountId: '', status: 'failed', externalCampaignId: null, error: 'TikTok campaign creation is not built yet.', updatedAt: new Date() } } }
  );
}

export async function createCampaign(req: AuthenticatedRequest, res: Response) {
  const parsed = createCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Check the campaign details — destination URL, at least 3 headlines, 2 descriptions, and a platform are required.' });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const now = new Date();
  const input = parsed.data;

  const doc = {
    tenantId,
    name: `${input.productTitle ?? 'Campaign'} — Purchase — ${now.toISOString().slice(0, 10)}`,
    productId: input.productId ?? null,
    productTitle: input.productTitle ?? null,
    destinationUrl: input.destinationUrl,
    goal: input.goal,
    budgetAmount: input.budgetAmount,
    budgetType: input.budgetType,
    assetIds: input.assetIds,
    headlines: input.headlines,
    descriptions: input.descriptions,
    primaryText: input.primaryText,
    platforms: {
      meta: input.platforms.includes('meta') ? { adAccountId: '', status: 'pending', externalCampaignId: null, error: null, updatedAt: now } : null,
      google: input.platforms.includes('google') ? { adAccountId: '', status: 'pending', externalCampaignId: null, error: null, updatedAt: now } : null,
      tiktok: input.platforms.includes('tiktok') ? { adAccountId: '', status: 'pending', externalCampaignId: null, error: null, updatedAt: now } : null,
    },
    createdBy: req.user!.email,
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.collection('adCampaigns').insertOne(doc);
  res.json({ success: true, campaign: campaignDto({ ...doc, _id: result.insertedId }) });

  // Fire-and-forget: each platform launches independently after the response is already sent, so
  // the request doesn't block on three slow external API calls — the frontend polls listCampaigns
  // to see each platform's status move from 'pending' to 'paused'/'failed'.
  const launches: Promise<void>[] = [];
  if (input.platforms.includes('google')) launches.push(launchOnGoogle(tenantId, result.insertedId, input));
  if (input.platforms.includes('meta')) launches.push(launchOnMeta(tenantId, result.insertedId));
  if (input.platforms.includes('tiktok')) launches.push(launchOnTiktok(tenantId, result.insertedId));
  void Promise.allSettled(launches);
}

export async function activateCampaign(req: AuthenticatedRequest, res: Response) {
  await setPlatformCampaignStatus(req, res, 'ENABLED');
}

export async function pauseCampaign(req: AuthenticatedRequest, res: Response) {
  await setPlatformCampaignStatus(req, res, 'PAUSED');
}

async function setPlatformCampaignStatus(req: AuthenticatedRequest, res: Response, googleStatus: 'ENABLED' | 'PAUSED') {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { id, platform } = req.params as { id: string; platform: AdAccountPlatform };
  const campaign = await db.collection('adCampaigns').findOne({ _id: new ObjectId(id), tenantId });
  if (!campaign || !campaign.platforms?.[platform]?.externalCampaignId) {
    res.status(404).json({ success: false, message: 'Campaign not found for this platform.' });
    return;
  }

  if (platform !== 'google') {
    res.status(501).json({ success: false, message: `${platform} campaign status changes are not built yet.` });
    return;
  }

  try {
    const account = await getConnectedAccount(tenantId, 'google');
    if (!account) throw new Error('Google Ads account no longer connected.');
    const refreshToken = decryptSecret(account.credentials.refreshToken);
    const { accessToken } = await refreshGoogleAccessToken(process.env.GOOGLE_ADS_CLIENT_ID!, process.env.GOOGLE_ADS_CLIENT_SECRET!, refreshToken);
    await setGoogleCampaignStatus(accessToken, process.env.GOOGLE_ADS_DEVELOPER_TOKEN!, account.externalAccountId, campaign.platforms.google.externalCampaignId, googleStatus);
    await db
      .collection('adCampaigns')
      .updateOne({ _id: campaign._id }, { $set: { 'platforms.google.status': googleStatus === 'ENABLED' ? 'active' : 'paused', 'platforms.google.updatedAt': new Date() } });
    res.json({ success: true });
  } catch (err) {
    logger.warn(`[google ads campaign] status change failed: ${(err as Error).message}`);
    res.status(502).json({ success: false, message: 'Could not update the campaign status on Google Ads.' });
  }
}
