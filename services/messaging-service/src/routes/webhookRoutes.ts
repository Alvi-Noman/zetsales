import { Router } from 'express';
import express from 'express';
import { metaWebhookVerify, metaWebhookReceive } from '../controllers/webhookController.js';

const router: Router = Router();

// Raw body needed here (not JSON-parsed) so X-Hub-Signature-256 verification runs over the exact
// bytes Meta signed.
const rawJson = express.raw({ type: 'application/json', limit: '2mb' });

router.get('/webhooks/meta', metaWebhookVerify);
router.post('/webhooks/meta', rawJson, metaWebhookReceive);

export default router;
