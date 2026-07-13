import { Router } from 'express';
import { requireAuth, requireTenant, requirePlugin, requireModule } from '../middleware/authMiddleware.js';
import { listConversations, listMessages, replyToConversation } from '../controllers/conversationsController.js';

const router: Router = Router();
const requireCustomerServicePlugin = requirePlugin('customerService');
const requireCustomerService = requireModule('customerService');

router.get('/conversations', requireAuth, requireTenant, requireCustomerServicePlugin, requireCustomerService, listConversations);
router.get('/conversations/:conversationId/messages', requireAuth, requireTenant, requireCustomerServicePlugin, requireCustomerService, listMessages);
router.post('/conversations/:conversationId/messages', requireAuth, requireTenant, requireCustomerServicePlugin, requireCustomerService, replyToConversation);

export default router;
