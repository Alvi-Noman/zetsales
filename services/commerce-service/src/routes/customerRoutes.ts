import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import { listCustomers, getCustomer, listCustomerOrders } from '../controllers/customersController.js';

const router: Router = Router();
const requireCustomers = requireModule('customers');
const guard = [requireAuth, requireTenant, requireCustomers] as const;

router.get('/customers', ...guard, listCustomers);
router.get('/customers/:phone', ...guard, getCustomer);
router.get('/customers/:phone/orders', ...guard, listCustomerOrders);

export default router;
