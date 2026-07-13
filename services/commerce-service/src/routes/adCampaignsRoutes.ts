import { Router } from 'express';
import { requireAuth, requireTenant, requirePlugin, requireModule } from '../middleware/authMiddleware.js';
import { uploadAdCreativeFiles } from '../middleware/adCreativeUpload.js';
import { uploadAdCreatives, listAdCreatives, deleteAdCreative } from '../controllers/adCreativesController.js';
import { createCampaign, listCampaigns, activateCampaign, pauseCampaign } from '../controllers/adCampaignsController.js';

const router: Router = Router();
const requireAdPerformancePlugin = requirePlugin('adPerformance');
const requireAdPerformance = requireModule('adPerformance');

router.post('/marketing/ad-creatives/upload', requireAuth, requireTenant, requireAdPerformancePlugin, requireAdPerformance, uploadAdCreativeFiles, uploadAdCreatives);
router.get('/marketing/ad-creatives', requireAuth, requireTenant, requireAdPerformancePlugin, requireAdPerformance, listAdCreatives);
router.delete('/marketing/ad-creatives/:id', requireAuth, requireTenant, requireAdPerformancePlugin, requireAdPerformance, deleteAdCreative);

router.post('/marketing/campaigns', requireAuth, requireTenant, requireAdPerformancePlugin, requireAdPerformance, createCampaign);
router.get('/marketing/campaigns', requireAuth, requireTenant, requireAdPerformancePlugin, requireAdPerformance, listCampaigns);
router.post('/marketing/campaigns/:id/activate/:platform', requireAuth, requireTenant, requireAdPerformancePlugin, requireAdPerformance, activateCampaign);
router.post('/marketing/campaigns/:id/pause/:platform', requireAuth, requireTenant, requireAdPerformancePlugin, requireAdPerformance, pauseCampaign);

export default router;
