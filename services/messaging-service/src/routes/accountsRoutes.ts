import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import {
  capabilities,
  listAccounts,
  facebookOAuthStart,
  facebookOAuthCallback,
  removeAccount,
  uploadMessagingImage,
} from '../controllers/accountsController.js';
import { uploadMessageImageFile } from '../middleware/upload.js';

const router: Router = Router();
const requireCustomerService = requireModule('customerService');

router.get('/capabilities', requireAuth, capabilities);
router.get('/accounts', requireAuth, requireTenant, requireCustomerService, listAccounts);
router.delete('/accounts/:accountId', requireAuth, requireTenant, requireCustomerService, removeAccount);

router.get('/accounts/facebook/oauth/start', requireAuth, requireTenant, requireCustomerService, facebookOAuthStart);
router.get('/accounts/facebook/oauth/callback', facebookOAuthCallback); // public: Facebook redirects the browser here

router.post('/uploads', requireAuth, requireTenant, requireCustomerService, uploadMessageImageFile, uploadMessagingImage);

export default router;
