import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import { uploadAdCreativeFiles } from '../middleware/adCreativeUpload.js';
import { uploadAdCreatives, listAdCreatives, deleteAdCreative } from '../controllers/adCreativesController.js';
import { createCampaign, listCampaigns, activateCampaign, pauseCampaign } from '../controllers/adCampaignsController.js';

const router: Router = Router();
const requireAdPerformance = requireModule('adPerformance');

router.post('/marketing/ad-creatives/upload', requireAuth, requireTenant, requireAdPerformance, uploadAdCreativeFiles, uploadAdCreatives);
router.get('/marketing/ad-creatives', requireAuth, requireTenant, requireAdPerformance, listAdCreatives);
router.delete('/marketing/ad-creatives/:id', requireAuth, requireTenant, requireAdPerformance, deleteAdCreative);

router.post('/marketing/campaigns', requireAuth, requireTenant, requireAdPerformance, createCampaign);
router.get('/marketing/campaigns', requireAuth, requireTenant, requireAdPerformance, listCampaigns);
router.post('/marketing/campaigns/:id/activate/:platform', requireAuth, requireTenant, requireAdPerformance, activateCampaign);
router.post('/marketing/campaigns/:id/pause/:platform', requireAuth, requireTenant, requireAdPerformance, pauseCampaign);

export default router;
