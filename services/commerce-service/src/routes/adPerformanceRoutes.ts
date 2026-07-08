import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import { listAdCosts, createAdCost, deleteAdCost, getAdPerformance } from '../controllers/adPerformanceController.js';

const router: Router = Router();
const requireAdPerformance = requireModule('adPerformance');

router.get('/marketing/ad-performance', requireAuth, requireTenant, requireAdPerformance, getAdPerformance);
router.get('/marketing/ad-costs', requireAuth, requireTenant, requireAdPerformance, listAdCosts);
router.post('/marketing/ad-costs', requireAuth, requireTenant, requireAdPerformance, createAdCost);
router.delete('/marketing/ad-costs/:id', requireAuth, requireTenant, requireAdPerformance, deleteAdCost);

export default router;
