import logger from './logger.js';

// A Slack Incoming Webhook (api.slack.com/messaging/webhooks) — no bot/app install needed.
// Left unset, alerts just go to the console instead of failing the check run.
export async function sendSlackAlert(message: string): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.warn(`[slack alert not sent, SLACK_WEBHOOK_URL unset] ${message}`);
    return;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
    if (!res.ok) logger.error(`Slack webhook responded with HTTP ${res.status}`);
  } catch (err) {
    logger.error(`Failed to post Slack alert: ${err instanceof Error ? err.message : String(err)}`);
  }
}
