import type { AppManifestDTO } from '@zetsales/shared';

// The single source of truth for every installable app — read by appsController's GET /apps and
// by the frontend App Store page. fraudChecker/callCenter/adPerformance/customerService are
// `embedded` (first-party, in-process); zetSalesAds is the first real `oauth`-type app, a
// standalone service (see /ads) installed via the real OAuth 2.0 flow (oauthController.ts).
export const APP_MANIFESTS: AppManifestDTO[] = [
  {
    key: 'fraudChecker',
    name: 'Fraud Checker',
    description: 'Flags suspicious orders before they are confirmed.',
    icon: 'shield-alert',
    authType: 'embedded',
    isEmbeddedApp: false,
    extensions: ['admin.order-details.block', 'admin.orders.index.row-badge', 'admin.orders.index.bulk-action'],
  },
  {
    key: 'callCenter',
    name: 'Call Center',
    description: 'Live confirmation-team dashboard: queue, agent presence, and call KPIs.',
    icon: 'phone-call',
    authType: 'embedded',
    isEmbeddedApp: true,
    extensions: [],
    sidebarLabel: 'Call Center',
    sidebarPath: '/call-center',
  },
  {
    key: 'adPerformance',
    name: 'Ad Performance',
    description: 'Manual ad-cost tracking and ROAS reporting by product and channel.',
    icon: 'megaphone',
    authType: 'embedded',
    isEmbeddedApp: true,
    extensions: [],
    sidebarLabel: 'Ad Performance',
    sidebarPath: '/ad-performance',
  },
  {
    key: 'customerService',
    name: 'Messages',
    description: 'Unified Facebook and Instagram inbox.',
    icon: 'headset',
    authType: 'embedded',
    isEmbeddedApp: true,
    extensions: [],
    sidebarLabel: 'Messages',
    sidebarPath: '/messages',
  },
  {
    key: 'zetSalesAds',
    name: 'ZetSales Ads',
    // A real standalone oauth-type app (services/../ads) — Facebook, TikTok, and Google
    // ad-account connection, given its own app identity (own install flow, own future pricing)
    // instead of being a generic platform integration. Installs via the real OAuth 2.0 flow
    // (see oauthController.ts) and renders inside ZetSales via the generic /apps/:appKey iframe
    // host, backed by /ads's own server-rendered UI.
    description: 'Connect your Facebook, TikTok, and Google Ads accounts to sync spend and campaigns automatically.',
    icon: 'rocket',
    authType: 'oauth',
    isEmbeddedApp: true,
    extensions: [],
    homepageUrl: process.env.PUBLIC_ADS_URL || 'http://localhost:8081/api/v1/ads',
    clientId: process.env.ADS_APP_CLIENT_ID,
  },
];

export function getAppManifest(appKey: string): AppManifestDTO | undefined {
  return APP_MANIFESTS.find((m) => m.key === appKey);
}
