import { AdAccountsTab } from '../../components/integrations/AdAccountsTab';

export function ZetSalesAdsPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-8 py-5">
        <h1 className="text-xl font-bold text-slate-900">ZetSales Ads</h1>
        <p className="mt-0.5 text-sm text-slate-500">Connect your Facebook, TikTok, and Google Ads accounts to sync spend and campaigns automatically.</p>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <AdAccountsTab />
      </div>
    </div>
  );
}
