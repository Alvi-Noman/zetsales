import { useEffect, useRef, useState } from 'react';
import type { AppExtensionTarget, ModuleKey } from '@zetsales/shared';
import { getAppSessionToken } from '../../lib/commerceApi';
import { useInstalledApps } from '../../hooks/useInstalledApps';

interface AppBlockFrameProps {
  appKey: ModuleKey;
  homepageUrl: string;
  target: AppExtensionTarget;
  context: Record<string, unknown>;
}

// One iframe for one installed oauth-type app filling this target. Mints a short-lived session
// token (App Bridge's own term) scoped to this specific extension context (e.g. an orderId), and
// listens for a postMessage resize handshake so the iframe can report its real content height —
// the extension's own content dictates the frame size, not a fixed guess from the host.
function AppBlockFrame({ appKey, homepageUrl, target, context }: AppBlockFrameProps) {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [height, setHeight] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;
    getAppSessionToken(appKey, target, context)
      .then((token) => {
        if (!cancelled) setSessionToken(token);
      })
      .catch(() => {
        // Session-token mint failed (app uninstalled mid-render, network blip) — the block just
        // stays empty rather than showing a broken iframe.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appKey, target, JSON.stringify(context)]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type === 'zetsales:app-block:resize' && typeof event.data.height === 'number') {
        setHeight(event.data.height);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (!sessionToken) return null;

  // Plain concatenation, not new URL(path, base) — the latter resolves relative to homepageUrl's
  // *directory*, silently dropping its last path segment (e.g. the "/ads" in ".../api/v1/ads")
  // since homepageUrl never has a trailing slash. Matches AppHostPage.tsx's convention.
  const url = new URL(`${homepageUrl}/${target.replace(/\./g, '/')}`);
  url.searchParams.set('session_token', sessionToken);

  return (
    <iframe
      ref={frameRef}
      src={url.toString()}
      title={`${appKey} — ${target}`}
      style={{ width: '100%', height: height || 1, border: 0 }}
    />
  );
}

// Renders a block-extension slot: every installed oauth-type app that declares `target` in its
// manifest gets one AppBlockFrame here.
export function AppBlock({ target, context = {} }: { target: AppExtensionTarget; context?: Record<string, unknown> }) {
  const { data: apps } = useInstalledApps();
  const matches = (apps ?? []).filter((a) => a.manifest.authType === 'oauth' && a.install?.status === 'installed' && a.manifest.extensions.includes(target) && a.manifest.homepageUrl);
  if (matches.length === 0) return null;

  return (
    <>
      {matches.map((a) => (
        <AppBlockFrame key={a.manifest.key} appKey={a.manifest.key} homepageUrl={a.manifest.homepageUrl!} target={target} context={context} />
      ))}
    </>
  );
}
