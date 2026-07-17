import { Router } from 'express';
import { requireAuth, requireTenant } from '../middleware/authMiddleware.js';
import { getBranding, updateBrandingFont, uploadBrandingLogo } from '../controllers/brandingController.js';
import { uploadLogoFile } from '../middleware/upload.js';

const router: Router = Router();

router.get('/settings/branding', requireAuth, requireTenant, getBranding);
router.put('/settings/branding', requireAuth, requireTenant, updateBrandingFont);
router.post('/settings/branding/logo', requireAuth, requireTenant, uploadLogoFile, uploadBrandingLogo);

export default router;
