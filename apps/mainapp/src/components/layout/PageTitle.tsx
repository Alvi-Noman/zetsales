import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

// The 4 bottom-nav tab roots — every other route (sub-pages, detail pages, and everything reached
// through the "More" sheet) gets a back arrow directly in front of its own title, mobile-only.
const BOTTOM_NAV_ROOTS = ["/home", "/orders", "/products", "/analytics"];

// Drop-in replacement for every page's own `<h1 className="zs-page-title">...</h1>` — same class,
// same text, just with a back arrow prepended on mobile sub-pages. One shared component instead of
// duplicating the back-navigation logic in all ~35 pages that render a page title.
export function PageTitle({
  children,
  hideBack,
}: {
  children: ReactNode;
  // For pages that already have their own descriptive "← All X" back link near the title (visible
  // at every width, not just mobile) — showing this arrow too would just be a second, redundant
  // way to do the same thing.
  hideBack?: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const showBack = !hideBack && !BOTTOM_NAV_ROOTS.includes(location.pathname);

  return (
    <h1 className="zs-page-title flex items-center gap-1.5">
      {showBack && (
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="-ml-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 lg:hidden"
        >
          <ArrowLeft size={18} />
        </button>
      )}
      {children}
    </h1>
  );
}
