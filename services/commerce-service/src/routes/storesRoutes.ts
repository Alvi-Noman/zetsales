import { Router } from 'express';
import { requireAuth, requireTenant } from '../middleware/authMiddleware.js';
import {
  listStores,
  removeStore,
  capabilities,
  connectShopifyToken,
  shopifyOAuthStart,
  shopifyOAuthCallback,
  connectWooKeys,
  wooAuthStart,
  wooAuthCallback,
  wooAuthStatus,
} from '../controllers/storesController.js';

const router: Router = Router();

router.get('/capabilities', requireAuth, capabilities);
router.get('/stores', requireAuth, requireTenant, listStores);
router.delete('/stores/:storeId', requireAuth, requireTenant, removeStore);

router.post('/stores/shopify/token', requireAuth, requireTenant, connectShopifyToken);
router.get('/stores/shopify/oauth/start', requireAuth, requireTenant, shopifyOAuthStart);
router.get('/stores/shopify/oauth/callback', shopifyOAuthCallback); // public: Shopify redirects the browser here

router.post('/stores/woocommerce/keys', requireAuth, requireTenant, connectWooKeys);
router.get('/stores/woocommerce/auth/start', requireAuth, requireTenant, wooAuthStart);
router.post('/stores/woocommerce/auth/callback', wooAuthCallback); // public: WooCommerce posts keys here
router.get('/stores/woocommerce/auth/status/:sessionId', requireAuth, requireTenant, wooAuthStatus);

export default router;
