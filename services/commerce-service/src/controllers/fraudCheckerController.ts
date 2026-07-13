import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';

// Stub only — wires up the plugin install flow end-to-end. Real fraud-detection rules/scoring are
// a separate follow-up.
export async function getFraudCheckerOverview(_req: AuthenticatedRequest, res: Response) {
  res.status(200).json({ success: true, message: 'Fraud Checker is installed. Detection logic coming soon.' });
}
