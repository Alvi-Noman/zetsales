import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import { listConversations, listMessages, replyToConversation } from '../controllers/conversationsController.js';

const router: Router = Router();
const requireCustomerService = requireModule('customerService');

router.get('/conversations', requireAuth, requireTenant, requireCustomerService, listConversations);
router.get('/conversations/:conversationId/messages', requireAuth, requireTenant, requireCustomerService, listMessages);
router.post('/conversations/:conversationId/messages', requireAuth, requireTenant, requireCustomerService, replyToConversation);

export default router;
