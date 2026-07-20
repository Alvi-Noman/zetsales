import { Router } from 'express';
import { listTenants, getTenant } from '../controllers/adminController.js';
import { requireAdmin } from '../middleware/adminAuth.js';

const router: Router = Router();

router.use(requireAdmin);
router.get('/tenants', listTenants);
router.get('/tenants/:id', getTenant);

export default router;
