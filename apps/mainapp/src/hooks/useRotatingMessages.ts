import { useEffect, useState } from 'react';

// Product create/update pushes to Shopify/WooCommerce one store at a time, each involving several
// round-trips (category resolve, create, per-variant sync, re-fetch) — often several seconds with
// nothing to show. Cycling through these messages while `active` is true is enough to signal real
// progress is happening rather than the UI having hung, without the backend needing to stream
// actual per-step events.
export function useRotatingMessages(messages: string[], active: boolean, intervalMs = 1800): string {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    const timer = setInterval(() => setIndex((i) => (i + 1) % messages.length), intervalMs);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, intervalMs, messages.length]);

  return messages[index];
}
