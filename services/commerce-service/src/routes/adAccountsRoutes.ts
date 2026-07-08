import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import {
  listAdAccounts,
  removeAdAccount,
  metaOAuthStart,
  metaOAuthCallback,
  tiktokOAuthStart,
  tiktokOAuthCallback,
  googleOAuthStart,
  googleOAuthCallback,
} from '../controllers/adAccountsController.js';

const router: Router = Router();
// Connecting an ad account is an Integrations concern (same bucket as Stores/Couriers) — only the
// resulting spend/performance data lives under the 'adPerformance' module.
const requireIntegrations = requireModule('integrations');

router.get('/marketing/ad-accounts', requireAuth, requireTenant, requireIntegrations, listAdAccounts);
router.delete('/marketing/ad-accounts/:id', requireAuth, requireTenant, requireIntegrations, removeAdAccount);

router.get('/marketing/ad-accounts/meta/oauth/start', requireAuth, requireTenant, requireIntegrations, metaOAuthStart);
router.get('/marketing/ad-accounts/meta/oauth/callback', metaOAuthCallback); // public: Meta redirects the browser here

router.get('/marketing/ad-accounts/tiktok/oauth/start', requireAuth, requireTenant, requireIntegrations, tiktokOAuthStart);
router.get('/marketing/ad-accounts/tiktok/oauth/callback', tiktokOAuthCallback); // public: TikTok redirects the browser here

router.get('/marketing/ad-accounts/google/oauth/start', requireAuth, requireTenant, requireIntegrations, googleOAuthStart);
router.get('/marketing/ad-accounts/google/oauth/callback', googleOAuthCallback); // public: Google redirects the browser here

export default router;
