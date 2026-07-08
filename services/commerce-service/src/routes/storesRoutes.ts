import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
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
const requireIntegrations = requireModule('integrations');

router.get('/capabilities', requireAuth, capabilities);
router.get('/stores', requireAuth, requireTenant, requireIntegrations, listStores);
router.delete('/stores/:storeId', requireAuth, requireTenant, requireIntegrations, removeStore);

router.post('/stores/shopify/token', requireAuth, requireTenant, requireIntegrations, connectShopifyToken);
router.get('/stores/shopify/oauth/start', requireAuth, requireTenant, requireIntegrations, shopifyOAuthStart);
router.get('/stores/shopify/oauth/callback', shopifyOAuthCallback); // public: Shopify redirects the browser here

router.post('/stores/woocommerce/keys', requireAuth, requireTenant, requireIntegrations, connectWooKeys);
router.get('/stores/woocommerce/auth/start', requireAuth, requireTenant, requireIntegrations, wooAuthStart);
router.post('/stores/woocommerce/auth/callback', wooAuthCallback); // public: WooCommerce posts keys here
router.get('/stores/woocommerce/auth/status/:sessionId', requireAuth, requireTenant, requireIntegrations, wooAuthStatus);

export default router;
