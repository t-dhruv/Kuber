import nodemailer from 'nodemailer';
import { Resend } from 'resend';

const FROM = process.env.SMTP_FROM ?? process.env.RESEND_FROM ?? 'Kuber <noreply@kuber.app>';
const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:3000';

// ─── Provider detection ────────────────────────────────────────────────────────

function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

function getSmtpTransport(): ReturnType<typeof nodemailer.createTransport> | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT ?? '587', 10),
    secure: parseInt(SMTP_PORT ?? '587', 10) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

// ─── Core send ────────────────────────────────────────────────────────────────

export async function sendMail(opts: { to: string; subject: string; html: string; text: string }) {
  // Resend takes priority if API key is set
  const resend = getResendClient();
  if (resend) {
    const { error } = await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    if (error) throw new Error(`Resend error: ${error.message}`);
    return;
  }

  // Fall back to SMTP
  const transport = getSmtpTransport();
  if (transport) {
    await transport.sendMail({ from: FROM, ...opts });
    return;
  }

  // Neither configured — log and continue
  console.log(`[email] No email provider configured — would send "${opts.subject}" to ${opts.to}`);
}

// ─── Emails ───────────────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(to: string, token: string) {
  const url = `${CLIENT_URL}/reset-password?token=${token}`;
  await sendMail({
    to,
    subject: 'Reset your Kuber password',
    text: `Reset your password: ${url}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>Reset your password</h2>
        <p>Click the button below to reset your Kuber password. This link expires in 1 hour.</p>
        <a href="${url}" style="display:inline-block;padding:10px 20px;background:#E5622A;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Reset Password</a>
        <p style="color:#888;font-size:12px;margin-top:24px">If you didn't request this, you can safely ignore this email.</p>
      </div>`,
  });
}

export async function sendAccountLockoutEmail(to: string, lockedUntil: Date) {
  const time = lockedUntil.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  await sendMail({
    to,
    subject: 'Kuber: Your account has been temporarily locked',
    text: `Your account has been locked due to too many failed login attempts. It will unlock at ${time}.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>Account temporarily locked</h2>
        <p>Too many failed login attempts. Your account is locked until <strong>${time}</strong>.</p>
        <p style="color:#888;font-size:12px">If this wasn't you, consider resetting your password.</p>
      </div>`,
  });
}

export async function sendTestEmail(to: string) {
  await sendMail({
    to,
    subject: 'Kuber email test',
    text: 'This is a test email from Kuber. Your email configuration is working.',
    html: '<div style="font-family:sans-serif"><h2>Email test</h2><p>Your Kuber email configuration is working correctly.</p></div>',
  });
}
