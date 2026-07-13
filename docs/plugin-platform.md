# ZetSales App Platform

This is the developer reference for building apps on ZetSales — modeled closely on Shopify's
own app platform, since that's the ecosystem most developers integrating with an e-commerce
admin are already fluent in. If you've built a Shopify app, most of this will look familiar:
OAuth 2.0 install, HMAC-signed webhooks, an embedded iframe with a session token, and Admin
Block Extensions for injecting small pieces of UI into existing pages.

Four official apps ship today — **Fraud Checker**, **Call Center**, **Ad Performance**, and
**Messages** — all currently `embedded` (first-party, running in-process). The mechanisms below
(OAuth install, webhooks, block extensions) are fully built and working end-to-end even though
no `oauth`-type app exists yet; they're the foundation both a future ZetSales-built standalone
service and a genuine outside developer would build against.

## Two kinds of apps

Shopify draws a hard line between two ways an app can integrate, and so does ZetSales:

- **Embedded App** — has its own sidebar nav entry and a full page. For an `oauth`-type app this
  page is an iframe (your own hosted UI, embedded); for `embedded`-type it's first-party code
  living directly in ZetSales's own frontend. A `settingsPath` is just another page of the
  embedded app, not a block extension — same as how a Shopify app's settings screen is just
  another route inside the app, not a separate extension mechanism.
- **Admin Block Extension** — a small piece of UI injected into an *existing* ZetSales page (an
  order's detail view, a product row, the dashboard), at a named **extension target**. Fraud
  Checker is this shape: it has no page of its own, just three block extensions.

An app can be either, both, or neither (a webhook-only integration with no UI at all is valid
too).

## App manifest

Every app is described by an `AppManifestDTO` (`packages/shared/src/types/index.ts`):

```ts
interface AppManifestDTO {
  key: ModuleKey;               // your app's unique identifier
  name: string;
  description: string;
  icon: string;
  authType: 'embedded' | 'oauth';
  extensions: AppExtensionTarget[];  // which block-extension targets you fill
  isEmbeddedApp: boolean;            // do you also get a sidebar nav entry + full page?
  homepageUrl?: string;              // base URL of your standalone service (oauth-type only)
  sidebarLabel?: string;
  sidebarPath?: string;
  settingsPath?: string;
  clientId?: string;                 // your OAuth 2.0 client_id (oauth-type only)
}
```

Today this is a static array (`services/commerce-service/src/apps/registry.ts`) maintained by
ZetSales. A self-serve registration flow for outside developers is intentionally out of scope
for now — the mechanisms below work the same either way, and adding self-serve registration
later doesn't change this contract.

## Installing — OAuth 2.0

For an `oauth`-type app, installation *is* the OAuth flow (same as Shopify — there's no separate
"install" step before it). Standard authorization-code grant:

**1. Merchant clicks Install** → redirected to:

```
GET /api/v1/oauth/authorize
    ?client_id=<your_client_id>
    &response_type=code
    &redirect_uri=<your_registered_redirect_uri>
    &state=<opaque_value_you_generate>
```

ZetSales validates `client_id` and `redirect_uri` against what you registered, then redirects
back to you:

```
<your_redirect_uri>?code=<authorization_code>&state=<same_state_you_sent>
```

The code is single-use and expires in 60 seconds.

**2. Exchange the code for an access token** — server-to-server, from your own backend:

```
POST /api/v1/oauth/access_token
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "client_id": "<your_client_id>",
  "client_secret": "<your_client_secret>",
  "code": "<authorization_code>",
  "redirect_uri": "<your_registered_redirect_uri>"
}
```

Response:

```json
{ "access_token": "…", "token_type": "bearer", "scope": "" }
```

Store this token — it's shown once. Use it as `Authorization: Bearer <access_token>` on every
subsequent call back into ZetSales.

**3. Register your webhook** (optional, but how you receive events — see below):

```
POST /api/v1/commerce/apps/:appKey/webhooks
Authorization: Bearer <access_token>
Content-Type: application/json

{ "webhookUrl": "https://your-app.example.com/webhooks/zetsales", "topics": ["orders/create", "orders/cancelled"] }
```

Response includes a `webhookSecret` (shown once) — save it for HMAC verification.

## Webhooks

ZetSales POSTs to your registered `webhookUrl` whenever a subscribed topic fires:

```json
{ "topic": "orders/create", "payload": { /* topic-specific */ }, "timestamp": "2026-01-01T00:00:00.000Z" }
```

Header `X-ZetSales-Hmac-Sha256` carries a base64-encoded HMAC-SHA256 digest of the raw request
body, keyed with your `webhookSecret` — the exact same convention Shopify uses for
`X-Shopify-Hmac-Sha256`, and the same one ZetSales itself already uses to verify *inbound*
Shopify/WooCommerce webhooks (`services/commerce-service/src/controllers/webhooksController.ts`).
Verify it before trusting the payload:

```ts
import crypto from 'crypto';

function verifyZetSalesWebhook(rawBody: Buffer, signature: string, secret: string): boolean {
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}
```

### Topic catalog

| Topic | Fires when |
|---|---|
| `orders/create` | A new order is created (manual, or synced from Shopify/WooCommerce) |
| `orders/updated` | Any field on an order changes via the staff-facing update endpoint |
| `orders/confirmed` | An order's stage transitions to Confirmed |
| `orders/cancelled` | An order's stage transitions to Cancelled |
| `customers/blocked` | A customer is added to the blocklist |
| `products/create` | A new product is pushed to at least one store |
| `products/update` | An existing product is updated |
| `payments/collected` | A COD order's payment is marked collected |
| `inventory/low_stock` | A SKU's available stock crosses at-or-below its reorder point (fires once per crossing, not on every subsequent low-stock mutation) |

Delivery is fire-and-forget with a single retry after a 2-second delay — there's no persistent
queue or delivery log in this version, so a delivery lost past that retry is simply dropped. If
you need guaranteed delivery, poll the relevant list endpoint as a backstop.

## Admin Block Extensions

Fills a named spot inside an existing ZetSales page. Your app receives a **session token** —
App Bridge's own term for this — via a query parameter when your iframe loads:

```
GET <homepageUrl><extension-target-path>?session_token=<jwt>
```

The session token is a short-lived (60s) signed JWT containing `{tenantId, userId, role, appKey,
target, ...context}` — verify it with the shared secret you were given at registration before
trusting who's viewing your extension. `context` varies by target (e.g. `{orderId}` for an
order-scoped target).

Report your rendered height so the host can size the iframe correctly:

```js
window.parent.postMessage({ type: 'zetsales:app-block:resize', height: document.body.scrollHeight }, '*');
```

### Extension target catalog

| Target | Surface | Context |
|---|---|---|
| `admin.order-details.block` | Order Detail Drawer, main body | `{orderId}` |
| `admin.order-details.action` | Order Detail Drawer, action footer | `{orderId}` |
| `admin.orders.index.row-badge` | Orders list, per row | `{orderId}` |
| `admin.orders.index.bulk-action` | Orders list, bulk-select action bar | — |
| `admin.products.index.row-badge` | Products list, per row | `{productId}` |
| `admin.product-details.block` | Product detail drawer | `{productId}` |
| `admin.customers.index.row-badge` | Customers list, per row | `{phone}` |
| `admin.customer-details.block` | Customer detail page | `{phone}` |
| `admin.home.block` | Home dashboard | — |
| `admin.analytics.block` | Analytics entry page | see below |
| `admin.topbar.block` | Global topbar, header-right icon cluster | — |

### Analytics cards are a special case

Unlike the other targets, Analytics already has its own plugin-shaped registry
(`apps/mainapp/src/analytics/cardRegistry.ts`) — a card is a `{key, title, category, description,
icon, CardComponent, DetailComponent}` entry in an array, and the entry/detail pages, the
show/hide layout system, and the `/analytics/:cardKey` route all fall out of that array
automatically. `AnalyticsCardDefinition.key` accepts an arbitrary string alongside the ~60
official keys, so a plugin-contributed card key doesn't collide with the closed
`AnalyticsCardKey` union used elsewhere. This is currently mechanism-only — building the actual
iframe-backed `CardComponent`/`DetailComponent` wrapper for an `oauth`-type app's analytics card
is a Phase 2 task.

## Embedded App pages (sidebar nav)

If your manifest sets `isEmbeddedApp: true` with a `sidebarLabel`/`sidebarPath`, an installed
`oauth`-type app gets a real sidebar entry pointing at a full-page iframe host, using the exact
same session-token mechanism as block extensions above (just for the whole page instead of a
slot). `settingsPath`, if set, works the same way under Settings → Apps → Configure.

## Minimal reference service

A ~40-line skeleton covering the OAuth callback, token exchange, and one block extension route:

```ts
import express from 'express';
import jwt from 'jsonwebtoken';

const app = express();
app.use(express.json());

const CLIENT_ID = process.env.ZETSALES_CLIENT_ID!;
const CLIENT_SECRET = process.env.ZETSALES_CLIENT_SECRET!;
const SESSION_SECRET = process.env.ZETSALES_SESSION_SECRET!; // given at registration

// Step 1 target: ZetSales redirects here after the merchant approves the install.
app.get('/oauth/callback', async (req, res) => {
  const { code } = req.query;
  const tokenRes = await fetch('https://<zetsales-host>/api/v1/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: `${req.protocol}://${req.get('host')}/oauth/callback`,
    }),
  });
  const { access_token } = await tokenRes.json();
  // Persist access_token for this tenant, then register your webhook (see above).
  res.send('Installed! You can close this tab.');
});

// An admin.order-details.block extension — verifies the session token before rendering.
app.get('/embed/order-details', (req, res) => {
  try {
    const payload = jwt.verify(req.query.session_token as string, SESSION_SECRET) as { orderId: string };
    res.send(`<html><body>Order ${payload.orderId} — your extension content here.
      <script>window.parent.postMessage({type:'zetsales:app-block:resize', height: document.body.scrollHeight}, '*')</script>
      </body></html>`);
  } catch {
    res.status(401).send('Invalid session token');
  }
});

app.listen(3100);
```
