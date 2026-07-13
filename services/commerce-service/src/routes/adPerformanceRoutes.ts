import { Router } from 'express';
import { requireAuth, requireTenant, requirePlugin, requireModule } from '../middleware/authMiddleware.js';
import { listAdCosts, createAdCost, deleteAdCost, getAdPerformance } from '../controllers/adPerformanceController.js';

const router: Router = Router();
const requireAdPerformancePlugin = requirePlugin('adPerformance');
const requireAdPerformance = requireModule('adPerformance');

router.get('/marketing/ad-performance', requireAuth, requireTenant, requireAdPerformancePlugin, requireAdPerformance, getAdPerformance);
router.get('/marketing/ad-costs', requireAuth, requireTenant, requireAdPerformancePlugin, requireAdPerformance, listAdCosts);
router.post('/marketing/ad-costs', requireAuth, requireTenant, requireAdPerformancePlugin, requireAdPerformance, createAdCost);
router.delete('/marketing/ad-costs/:id', requireAuth, requireTenant, requireAdPerformancePlugin, requireAdPerformance, deleteAdCost);

export default router;
