import { Router } from 'express';
import express from 'express';
import { shopifyOrderWebhook, wooOrderWebhook } from '../controllers/webhooksController.js';

const router: Router = Router();

// Raw body needed here (not JSON-parsed) so HMAC signature verification runs over the exact
// bytes the platform signed.
const rawJson = express.raw({ type: 'application/json', limit: '2mb' });

router.post('/webhooks/shopify/:storeId/orders', rawJson, shopifyOrderWebhook);
router.post('/webhooks/woocommerce/:storeId/orders', rawJson, wooOrderWebhook);

export default router;
