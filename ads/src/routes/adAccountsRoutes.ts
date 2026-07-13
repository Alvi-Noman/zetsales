import { Router } from 'express';
import {
  metaOAuthStart,
  metaOAuthCallback,
  tiktokOAuthStart,
  tiktokOAuthCallback,
  googleOAuthStart,
  googleOAuthCallback,
  removeAdAccount,
} from '../controllers/adAccountsController.js';

const router: Router = Router();

// All of these are reached via plain browser links/forms carrying `adsToken` (see
// embedController.ts) rather than an Authorization header — this is server-rendered HTML inside
// an iframe, not a JS SPA calling an API client.
router.get('/oauth/meta/start', metaOAuthStart);
router.get('/oauth/meta/callback', metaOAuthCallback); // public — Meta redirects the browser here
router.get('/oauth/tiktok/start', tiktokOAuthStart);
router.get('/oauth/tiktok/callback', tiktokOAuthCallback); // public
router.get('/oauth/google/start', googleOAuthStart);
router.get('/oauth/google/callback', googleOAuthCallback); // public
router.post('/accounts/:id/remove', removeAdAccount);

export default router;
