import { AdAccountsTab } from "../../components/integrations/AdAccountsTab";
import { PageTitle } from "../../components/layout/PageTitle";

export function ZetSalesAdsPage() {
  return (
    <div className="zs-page">
      <div className="zs-page-header">
        <PageTitle>ZetSales Ads</PageTitle>
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
