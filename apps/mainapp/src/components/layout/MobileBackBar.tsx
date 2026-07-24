import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

// The 4 bottom-nav tab roots — every other route (sub-pages, detail pages, and everything reached
// through the "More" sheet) gets a back button. Sits directly above each page's own content/heading
// (rendered in AppShell right before <Outlet />), not in the generic Topbar alongside search/bell/
// avatar — a back action reads as "go back from this screen," which belongs next to that screen's
// own title, not floating in unrelated global chrome.
const BOTTOM_NAV_ROOTS = ["/home", "/orders", "/products", "/analytics"];

export function MobileBackBar() {
  const location = useLocation();
  const navigate = useNavigate();
  if (BOTTOM_NAV_ROOTS.includes(location.pathname)) return null;

  return (
    <button
      onClick={() => navigate(-1)}
      className="flex items-center gap-1.5 px-4 pt-3 text-sm font-semibold text-slate-500 hover:text-slate-800 lg:hidden"
    >
      <ArrowLeft size={16} /> Back
    </button>
  );
}
