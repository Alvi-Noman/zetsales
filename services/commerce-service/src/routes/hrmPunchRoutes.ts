import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { resolvePublicTenant } from '../middleware/publicTenantMiddleware.js';
import { listPunchEmployees, getPunchStatus, submitPunch } from '../controllers/hrmPunchController.js';

const router: Router = Router();

// Stricter than the global API limiter — a 4-6 digit PIN has a small keyspace, and this is the
// only unauthenticated route in commerce-service, so it gets its own tighter ceiling on top of
// the per-employee lockout in hrmPunchController.
const punchLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
});

router.use('/public/hrm', punchLimiter, resolvePublicTenant);

router.get('/public/hrm/employees', listPunchEmployees);
router.post('/public/hrm/punch/status', getPunchStatus);
router.post('/public/hrm/punch/action', submitPunch);

export default router;
