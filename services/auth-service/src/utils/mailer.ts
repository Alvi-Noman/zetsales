import { Resend } from 'resend';

let client: Resend | null | undefined;

// Lazily constructed (not at import time) so this module can be imported freely even in
// environments where RESEND_API_KEY isn't set yet (local dev without email configured) — the
// missing-key case is handled per-send, not at process startup.
function getClient(): Resend | null {
  if (client !== undefined) return client;
  const apiKey = process.env.RESEND_API_KEY?.trim();
  client = apiKey ? new Resend(apiKey) : null;
  return client;
}

const FROM = process.env.EMAIL_FROM?.trim() || 'ZetSales <noreply@zetsales.com>';

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const resend = getClient();
  if (!resend) {
    // No key configured — this is a real gap in production but shouldn't block local
    // development, so the link is logged instead of silently disappearing.
    console.warn(`[mailer] RESEND_API_KEY not set — password reset link for ${to}: ${resetUrl}`);
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: 'Reset your ZetSales password',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #0f172a;">
        <h2 style="margin: 0 0 12px; font-size: 20px; font-weight: 700;">Reset your password</h2>
        <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #475569;">
          We received a request to reset the password for your ZetSales account. This link expires in 1 hour.
        </p>
        <a href="${resetUrl}" style="display: inline-block; background: #4f46e5; color: #fff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 10px 20px; border-radius: 8px;">
          Reset password
        </a>
        <p style="margin: 24px 0 0; font-size: 12.5px; color: #94a3b8;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  });

  if (error) {
    throw new Error(`Failed to send password reset email: ${error.message}`);
  }
}
