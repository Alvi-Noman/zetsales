import { Router } from 'express';
import { orderDetailsBlock } from '../controllers/blockController.js';

const router: Router = Router();

// Path must match target.replace(/\./g, '/') for 'admin.order-details.block' (see AppBlock.tsx).
router.get('/admin/order-details/block', orderDetailsBlock);

export default router;
