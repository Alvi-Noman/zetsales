import { Router } from 'express';
import { inbound } from '../controllers/webhookController.js';

const router: Router = Router();

// Public — commerce-service's dispatchAppWebhook calls this directly, server-to-server.
router.post('/webhooks/inbound', inbound);

export default router;
