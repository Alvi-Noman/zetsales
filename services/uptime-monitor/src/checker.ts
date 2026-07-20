import type { Browser } from 'playwright';

const TIMEOUT_MS = Number(process.env.CHECK_TIMEOUT_MS ?? 15_000);

export interface CheckResult {
  ok: boolean;
  detail: string;
}

export async function runHttpCheck(url: string): Promise<CheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok ? { ok: true, detail: `HTTP ${res.status}` } : { ok: false, detail: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

// A fresh, cookie-less browser context per check — catches "the bundle failed to load" and
// "the page rendered blank" the same way a real first-time visitor would hit them, which a plain
// HTTP HEAD/GET request to the URL (200 OK for a blank shell) would miss entirely.
export async function runUiCheck(browser: Browser, url: string, expectText: string): Promise<CheckResult> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    await page.getByText(expectText, { exact: false }).first().waitFor({ timeout: TIMEOUT_MS });
    return { ok: true, detail: 'rendered' };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  } finally {
    await context.close();
  }
}
