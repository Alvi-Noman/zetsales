export interface HttpTarget {
  kind: 'http';
  name: string;
  url: string;
}

export interface UiTarget {
  kind: 'ui';
  name: string;
  url: string;
  // Text only present once the app has actually mounted and rendered its login screen (every
  // check runs in a fresh, cookie-less browser context, so this is always what a real visitor
  // hitting the app would land on) — as opposed to a blank page, a 502, or a JS bundle that
  // failed to load.
  expectText: string;
}

export type Target = HttpTarget | UiTarget;

// Reads target URLs from env so the same image works across environments without a code change —
// see .env.example for what each var does. A target is skipped entirely if its URL isn't set,
// rather than failing the whole monitor (e.g. adminapp isn't deployed publicly yet).
export function buildTargets(): Target[] {
  const targets: Target[] = [];

  const authHealthUrl = process.env.AUTH_SERVICE_HEALTH_URL;
  if (authHealthUrl) targets.push({ kind: 'http', name: 'auth-service', url: authHealthUrl });

  const commerceHealthUrl = process.env.COMMERCE_SERVICE_HEALTH_URL;
  if (commerceHealthUrl) targets.push({ kind: 'http', name: 'commerce-service', url: commerceHealthUrl });

  const messagingHealthUrl = process.env.MESSAGING_SERVICE_HEALTH_URL;
  if (messagingHealthUrl) targets.push({ kind: 'http', name: 'messaging-service', url: messagingHealthUrl });

  const mainappUrl = process.env.MAINAPP_URL;
  if (mainappUrl) {
    targets.push({ kind: 'ui', name: 'mainapp', url: mainappUrl, expectText: 'Sign in to your ZetSales workspace' });
  }

  const adminappUrl = process.env.ADMINAPP_URL;
  if (adminappUrl) {
    targets.push({ kind: 'ui', name: 'adminapp', url: adminappUrl, expectText: 'ZetSales Control Center' });
  }

  return targets;
}
