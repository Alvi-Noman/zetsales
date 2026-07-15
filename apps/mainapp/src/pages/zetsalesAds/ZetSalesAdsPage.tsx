import { AdAccountsTab } from "../../components/integrations/AdAccountsTab";

export function ZetSalesAdsPage() {
  return (
    <div className="zs-page">
      <div className="zs-page-header">
        <h1 className="zs-page-title">ZetSales Ads</h1>
        <p className="zs-page-description">
          Connect your Facebook, TikTok, and Google Ads accounts to sync spend
          and campaigns automatically.
        </p>
      </div>
      <div className="zs-page-body overflow-y-auto">
        <AdAccountsTab />
      </div>
    </div>
  );
}
