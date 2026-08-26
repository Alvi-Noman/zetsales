import { FileSpreadsheet, Globe } from 'lucide-react';
import shopifyLogoUrl from '../../assets/logos/shopify-logo-svg-vector.svg';
import wooCommerceLogoUrl from '../../assets/logos/woocommerce-logo-svg-vector.svg';

interface LogoProps {
  size?: number;
  className?: string;
}

// Real brand marks. Shopify's is a bare bag icon (already brand-colored, no background needed);
// WooCommerce's ships with its own purple bubble baked in — neither needs the colored-square
// wrapper the placeholder version used.
export function ShopifyLogo({ size = 18, className }: LogoProps) {
  return <img src={shopifyLogoUrl} alt="Shopify" className={className} style={{ height: size, width: 'auto' }} />;
}

export function WooCommerceLogo({ size = 18, className }: LogoProps) {
  return <img src={wooCommerceLogoUrl} alt="WooCommerce" className={className} style={{ height: size, width: 'auto' }} />;
}

// CSV-imported stores have no real platform brand mark — a plain spreadsheet icon stands in so
// every `PLATFORM_META[store.platform]` lookup across the app has a 'csv' entry to fall back on.
export function CsvLogo({ size = 18, className }: LogoProps) {
  return <FileSpreadsheet size={size} className={className} />;
}

// ZetSite likewise has no shipped brand-mark asset here — a plain globe icon stands in, same
// fallback reasoning as CsvLogo above.
export function ZetSiteLogo({ size = 18, className }: LogoProps) {
  return <Globe size={size} className={className} />;
}
