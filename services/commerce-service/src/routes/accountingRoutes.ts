import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import { listExpenses, createExpense, deleteExpense, getProfitAndLoss, getCommittedToSuppliers } from '../controllers/accountingController.js';

const router: Router = Router();
const requireAccounting = requireModule('accounting');

router.get('/accounting/pnl', requireAuth, requireTenant, requireAccounting, getProfitAndLoss);
router.get('/accounting/committed-to-suppliers', requireAuth, requireTenant, requireAccounting, getCommittedToSuppliers);
router.get('/accounting/expenses', requireAuth, requireTenant, requireAccounting, listExpenses);
router.post('/accounting/expenses', requireAuth, requireTenant, requireAccounting, createExpense);
router.delete('/accounting/expenses/:id', requireAuth, requireTenant, requireAccounting, deleteExpense);

export default router;
