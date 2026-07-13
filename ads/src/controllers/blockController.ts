import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '@zetsales/config/validateEnv';
import { getDb } from '../utils/db.js';

// Proves the block-extension iframe mechanism (AppBlock.tsx) actually renders end-to-end — the
// first real target any oauth-type app has ever declared (see registry.ts). Renders inside the
// Order Detail Drawer at admin.order-details.block.
export async function orderDetailsBlock(req: Request, res: Response) {
  const sessionToken = req.query.session_token as string | undefined;
  if (!sessionToken) {
    res.status(401).send('Missing session token');
    return;
  }

  let tenantId: string;
  let orderId: string | undefined;
  try {
    const claims = jwt.verify(sessionToken, env.JWT_SECRET) as { tenantId: string; orderId?: string };
    tenantId = claims.tenantId;
    orderId = claims.orderId;
  } catch {
    res.status(401).send('Session expired — reopen this order.');
    return;
  }

  const count = await getDb().collection('adAccounts').countDocuments({ tenantId });

  res.status(200).send(`<!doctype html>
<html><head><meta charset="utf-8" /><style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 12px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #1e293b; }
  .badge { width: 28px; height: 28px; border-radius: 6px; background: #eef2ff; color: #6366f1; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; flex-shrink: 0; }
</style></head>
<body>
  <div class="row"><span class="badge">Z</span><span>ZetSales Ads &mdash; ${count} connected ad account${count === 1 ? '' : 's'}${orderId ? ` (order ${orderId})` : ''}</span></div>
  <script>
    function report() { window.parent.postMessage({ type: 'zetsales:app-block:resize', height: document.body.scrollHeight }, '*'); }
    window.addEventListener('load', report);
    new ResizeObserver(report).observe(document.body);
  </script>
</body></html>`);
}
