import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { createModuleLogger } from './logger.js';
import { emailsSentTotal } from './metrics.js';
import { prisma } from './prisma.js';
import { decrypt } from './encryption.js';
const log = createModuleLogger('email');

const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:3000';
const DEFAULT_FROM = 'Kuber <noreply@kuber.app>';

// ─── DB config loader ─────────────────────────────────────────────────────────

interface ResolvedEmailConfig {
  provider: 'resend' | 'smtp' | 'none';
  resendApiKey?: string;
  resendFrom?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
}

async function getDbEmailConfig(): Promise<ResolvedEmailConfig | null> {
  try {
    const cfg = await prisma.emailConfig.findUnique({ where: { id: 'singleton' } });
    if (!cfg || cfg.provider === 'none') return null;
    return {
      provider: cfg.provider as 'resend' | 'smtp',
      resendApiKey: cfg.resendApiKey ? decrypt(cfg.resendApiKey) : undefined,
      resendFrom: cfg.resendFrom || undefined,
      smtpHost: cfg.smtpHost || undefined,
      smtpPort: cfg.smtpPort,
      smtpUser: cfg.smtpUser || undefined,
      smtpPass: cfg.smtpPass ? decrypt(cfg.smtpPass) : undefined,
      smtpFrom: cfg.smtpFrom || undefined,
    };
  } catch {
    return null;
  }
}

// ─── Provider detection ────────────────────────────────────────────────────────

function getResendClient(cfg?: ResolvedEmailConfig): { client: Resend; from: string } | null {
  const key = cfg?.resendApiKey ?? process.env.RESEND_API_KEY;
  if (!key) return null;
  const from = cfg?.resendFrom ?? process.env.RESEND_FROM ?? process.env.SMTP_FROM ?? DEFAULT_FROM;
  return { client: new Resend(key), from };
}

function getSmtpTransport(cfg?: ResolvedEmailConfig): { transport: ReturnType<typeof nodemailer.createTransport>; from: string } | null {
  const host = cfg?.smtpHost ?? process.env.SMTP_HOST;
  const user = cfg?.smtpUser ?? process.env.SMTP_USER;
  const pass = cfg?.smtpPass ?? process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = cfg?.smtpPort ?? parseInt(process.env.SMTP_PORT ?? '587', 10);
  const from = cfg?.smtpFrom ?? process.env.SMTP_FROM ?? DEFAULT_FROM;
  return {
    transport: nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    }),
    from,
  };
}

// ─── Core send ────────────────────────────────────────────────────────────────

export async function sendMail(opts: { to: string; subject: string; html: string; text: string }) {
  const dbCfg = await getDbEmailConfig();

  // If DB config specifies a provider, use it exclusively
  if (dbCfg) {
    if (dbCfg.provider === 'resend') {
      const resend = getResendClient(dbCfg);
      if (resend) {
        const { error } = await resend.client.emails.send({ from: resend.from, to: opts.to, subject: opts.subject, html: opts.html, text: opts.text });
        if (error) { emailsSentTotal.inc({ type: 'transactional', status: 'failure' }); throw new Error(`Resend error: ${error.message}`); }
        emailsSentTotal.inc({ type: 'transactional', status: 'success' });
        return;
      }
    }
    if (dbCfg.provider === 'smtp') {
      const smtp = getSmtpTransport(dbCfg);
      if (smtp) {
        try { await smtp.transport.sendMail({ from: smtp.from, ...opts }); emailsSentTotal.inc({ type: 'transactional', status: 'success' }); }
        catch (err) { emailsSentTotal.inc({ type: 'transactional', status: 'failure' }); log.error({ err }, 'Failed to send email via SMTP'); throw err; }
        return;
      }
    }
  }

  // Fall back to env vars
  // Resend takes priority if API key is set
  const resend = getResendClient();
  if (resend) {
    const { error } = await resend.client.emails.send({
      from: resend.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    if (error) {
      emailsSentTotal.inc({ type: 'transactional', status: 'failure' });
      throw new Error(`Resend error: ${error.message}`);
    }
    emailsSentTotal.inc({ type: 'transactional', status: 'success' });
    return;
  }

  // Fall back to SMTP
  const smtp = getSmtpTransport();
  if (smtp) {
    try {
      await smtp.transport.sendMail({ from: smtp.from, ...opts });
      emailsSentTotal.inc({ type: 'transactional', status: 'success' });
    } catch (err) {
      emailsSentTotal.inc({ type: 'transactional', status: 'failure' });
      log.error({ err }, 'Failed to send email via SMTP');
      throw err;
    }
    return;
  }

  // Neither configured — log and continue
  log.warn({ subject: opts.subject, to: opts.to }, 'No email provider configured — skipping send');
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

export async function sendWelcomeEmail(to: string, firstName: string) {
  await sendMail({
    to,
    subject: 'Welcome to Kuber!',
    text: `Hi ${firstName},\n\nWelcome to Kuber — your self-hosted personal finance manager.\n\nGet started by adding your first account at ${CLIENT_URL}.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>Welcome to Kuber, ${firstName}!</h2>
        <p>Your self-hosted personal finance manager is ready. Start by adding your first account to track your finances.</p>
        <a href="${CLIENT_URL}" style="display:inline-block;padding:10px 20px;background:#6366f1;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Open Kuber</a>
        <p style="color:#888;font-size:12px;margin-top:24px">You're receiving this because you just created a Kuber account.</p>
      </div>`,
  });
}

export async function sendHouseholdInviteEmail(to: string, householdName: string, token: string) {
  const url = `${CLIENT_URL}/signup?invite=${encodeURIComponent(token)}`;
  await sendMail({
    to,
    subject: `Join ${householdName} on Kuber`,
    text: `You've been invited to join ${householdName} on Kuber.\n\nAccept the invite: ${url}\n\nThis invite expires in 7 days.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>Join ${householdName} on Kuber</h2>
        <p>You've been invited to join this household in Kuber.</p>
        <a href="${url}" style="display:inline-block;padding:10px 20px;background:#6366f1;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Accept Invite</a>
        <p style="color:#888;font-size:12px;margin-top:24px">This invite expires in 7 days. If you weren't expecting this, you can ignore this email.</p>
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
