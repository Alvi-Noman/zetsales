import { Router } from 'express';
import { oauthCallback } from '../controllers/installController.js';

const router: Router = Router();

// Public — ZetSales redirects the merchant's browser here after GET /oauth/authorize.
router.get('/oauth/callback', oauthCallback);

export default router;
