import { chromium } from 'playwright';
import logger from './logger.js';
import { buildTargets } from './targets.js';
import { runHttpCheck, runUiCheck } from './checker.js';
import { sendSlackAlert } from './slack.js';

const INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS ?? 5 * 60_000);

// Per-target last-known status, kept in memory only — this process is a simple long-running
// loop, not a service other things depend on, so nothing is lost by resetting on redeploy/restart
// beyond a possible one-time "recovered" notice for something that was already back up.
const lastHealthy = new Map<string, boolean>();

async function runChecks(): Promise<void> {
  const targets = buildTargets();
  if (targets.length === 0) {
    logger.warn('No monitoring targets configured — set MAINAPP_URL / ADMINAPP_URL / *_HEALTH_URL in env.');
    return;
  }

  const needsBrowser = targets.some((t) => t.kind === 'ui');
  const browser = needsBrowser
    ? await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined })
    : null;

  try {
    for (const target of targets) {
      const result =
        target.kind === 'http' ? await runHttpCheck(target.url) : await runUiCheck(browser!, target.url, target.expectText);

      // Absent from the map only on the very first run — treated as "was healthy" so a target
      // that's already down when the monitor starts still fires an alert immediately, while one
      // that's already fine doesn't get a spurious "recovered" message.
      const wasHealthy = lastHealthy.get(target.name) ?? true;
      lastHealthy.set(target.name, result.ok);

      if (result.ok) {
        logger.info(`[ok] ${target.name} — ${result.detail}`);
        if (!wasHealthy) await sendSlackAlert(`:white_check_mark: *${target.name}* recovered — ${target.url}`);
      } else {
        logger.error(`[down] ${target.name} — ${result.detail}`);
        if (wasHealthy) {
          await sendSlackAlert(`:rotating_light: *${target.name}* appears to be down\n${target.url}\n${result.detail}`);
        }
      }
    }
  } finally {
    await browser?.close();
  }
}

async function loop(): Promise<void> {
  for (;;) {
    try {
      await runChecks();
    } catch (err) {
      logger.error(`Check run failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }
}

logger.info(`Uptime monitor starting — checking every ${INTERVAL_MS}ms`);
loop();

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
