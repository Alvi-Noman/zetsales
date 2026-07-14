import type { AppManifestDTO } from '@zetsales/shared';

// The single source of truth for every installable app — read by appsController's GET /apps and
// by the frontend App Store page. All five are `embedded` (first-party, in-process) today. The
// oauth-type machinery (oauthController.ts, session tokens, AppBlock, webhooks, AppHostPage.tsx)
// was proven working end-to-end with ZetSales Ads as a real standalone service, then kept in
// place — deliberately unused — for whenever a real 3rd-party oauth app shows up.
export const APP_MANIFESTS: AppManifestDTO[] = [
  {
    key: 'fraudChecker',
    name: 'ZetSales Order Risk Checker',
    description: 'Flags risky orders using this customer’s own delivery history with Steadfast and Pathao — no external API, no shared data.',
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
    description: 'Connect your Facebook, TikTok, and Google Ads accounts to sync spend and campaigns automatically.',
    icon: 'rocket',
    authType: 'embedded',
    isEmbeddedApp: true,
    extensions: [],
    sidebarLabel: 'ZetSales Ads',
    sidebarPath: '/zetsales-ads',
  },
];

export function getAppManifest(appKey: string): AppManifestDTO | undefined {
  return APP_MANIFESTS.find((m) => m.key === appKey);
}
