import { useMemo } from 'react';
import { Blocks } from 'lucide-react';
import { ROLE_DEFINITIONS, PLUGIN_MODULES } from '@zetsales/shared';
import { NAV_ITEMS, NAV_FOOTER_ITEMS, type NavItem } from './navigation';
import { useAuth } from '../context/AuthContext';
import { useInstalledApps } from '../hooks/useInstalledApps';

// Settings/Home are account-level, not business-data modules, so every team member sees them
// regardless of role — everything else follows the signed-in member's role permissions.
const ALWAYS_VISIBLE_MODULES = ['home', 'settings'] as const;

// Shared by Sidebar (desktop) and MoreMenuSheet (mobile) so role/plugin visibility rules are
// defined exactly once — two separately-maintained copies of an access-control check is how they
// silently drift apart.
export function useVisibleNavItems() {
  const { user } = useAuth();
  const { data: apps } = useInstalledApps();

  // A missing role only happens for accounts created before team roles existed — fail open as
  // owner rather than locking a pre-existing user out of their own workspace.
  const allowedModules = useMemo(
    () => (user?.role ? ROLE_DEFINITIONS[user.role].modules : ROLE_DEFINITIONS.owner.modules),
    [user?.role],
  );

  const isVisible = (item: NavItem) => {
    if (!ALWAYS_VISIBLE_MODULES.includes(item.module as (typeof ALWAYS_VISIBLE_MODULES)[number]) && !allowedModules.includes(item.module)) return false;
    // Plugin modules need the tenant to have installed them, on top of the role check above —
    // Settings → Plugins is where an owner/admin turns them on.
    if (PLUGIN_MODULES.includes(item.module) && !user?.installedPlugins?.includes(item.module)) return false;
    return true;
  };

  // Embedded plugins (own nav entry + full page) that are oauth-type and installed get a nav row
  // too, on top of the static NAV_ITEMS list — see Sidebar's original comment for the full
  // reasoning on embedded vs oauth-type plugin routing.
  const embeddedAppNavItems: NavItem[] = (apps ?? [])
    .filter((a) => a.manifest.authType === 'oauth' && a.manifest.isEmbeddedApp && a.install?.status === 'installed')
    .map((a) => ({ label: a.manifest.sidebarLabel ?? a.manifest.name, path: `/apps/${a.manifest.key}`, icon: Blocks, module: a.manifest.key }));

  const visibleNavItems = [...NAV_ITEMS.filter(isVisible), ...embeddedAppNavItems];
  const visibleFooterItems = NAV_FOOTER_ITEMS.filter(isVisible);

  return { visibleNavItems, visibleFooterItems };
}
