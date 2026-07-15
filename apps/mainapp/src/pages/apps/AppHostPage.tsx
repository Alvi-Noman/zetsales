import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getAppSessionToken } from '../../lib/commerceApi';
import { useInstalledApps } from '../../hooks/useInstalledApps';

// The generic full-page host for an oauth-type embedded plugin — described in
// docs/plugin-platform.md but not actually built until ZetSales Ads became the first real
// oauth-type plugin. Mints a session token (App Bridge's own term) and renders the plugin's own
// `/embed/overview` page in an iframe, same session-token contract AppBlock.tsx uses for
// block extensions, just for a whole page instead of one slot.
export function AppHostPage() {
  const { appKey } = useParams<{ appKey: string }>();
  const { data: apps, isLoading } = useInstalledApps();
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  const entry = apps?.find((a) => a.manifest.key === appKey);

  useEffect(() => {
    if (!entry || entry.manifest.authType !== 'oauth' || !entry.manifest.homepageUrl) return;
    let cancelled = false;
    getAppSessionToken(entry.manifest.key, undefined, {})
      .then((token) => {
        if (!cancelled) setSessionToken(token);
      })
      .catch(() => {
        // The iframe just stays empty with a message below — nothing else to fall back to.
      });
    return () => {
      cancelled = true;
    };
  }, [entry]);

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading…</div>;
  }
  if (!entry || entry.install?.status !== 'installed' || entry.manifest.authType !== 'oauth' || !entry.manifest.homepageUrl) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">This plugin isn't installed.</div>;
  }
  if (!sessionToken) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">Connecting…</div>;
  }

  return (
    <iframe
      src={`${entry.manifest.homepageUrl}/embed/overview?session_token=${encodeURIComponent(sessionToken)}`}
      title={entry.manifest.name}
      className="h-full w-full border-0"
    />
  );
}
