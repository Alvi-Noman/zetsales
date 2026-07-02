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
