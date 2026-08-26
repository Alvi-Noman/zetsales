import { Router } from 'express';
import express from 'express';
import {
  shopifyOrderWebhook, shopifyCheckoutWebhook, shopifyProductWebhook, shopifyProductDeleteWebhook, wooOrderWebhook,
  wooProductWebhook, wooProductDeleteWebhook, steadfastWebhook, pathaoWebhook, zetSiteWebhook,
} from '../controllers/webhooksController.js';

const router: Router = Router();

// Raw body needed here (not JSON-parsed) so HMAC signature verification runs over the exact
// bytes the platform signed.
const rawJson = express.raw({ type: 'application/json', limit: '2mb' });

router.post('/webhooks/shopify/:storeId/orders', rawJson, shopifyOrderWebhook);
router.post('/webhooks/shopify/:storeId/checkouts', rawJson, shopifyCheckoutWebhook);
router.post('/webhooks/shopify/:storeId/products', rawJson, shopifyProductWebhook);
router.post('/webhooks/shopify/:storeId/products/delete', rawJson, shopifyProductDeleteWebhook);
router.post('/webhooks/woocommerce/:storeId/orders', rawJson, wooOrderWebhook);
router.post('/webhooks/woocommerce/:storeId/products', rawJson, wooProductWebhook);
router.post('/webhooks/woocommerce/:storeId/products/delete', rawJson, wooProductDeleteWebhook);
router.post('/webhooks/zetsite/:storeId', rawJson, zetSiteWebhook);
router.post('/webhooks/steadfast', rawJson, steadfastWebhook);
router.post('/webhooks/pathao', rawJson, pathaoWebhook);

export default router;
