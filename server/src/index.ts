import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import dashboardRouter from './routes/dashboard';
import accountsRouter from './routes/accounts';
import transactionsRouter from './routes/transactions';
import duplicatesRouter from './routes/duplicates';
import budgetsRouter from './routes/budgets';
import cashflowRouter from './routes/cashflow';
import reportsRouter from './routes/reports';
import exportsRouter from './routes/exports';
import recurringRouter from './routes/recurring';
import goalsRouter from './routes/goals';
import investmentsRouter from './routes/investments';
import settingsRouter from './routes/settings';
import schedulesRouter from './routes/schedules';
import notificationsRouter from './routes/notifications';
import advisorRouter from './routes/advisor';
import categoriesRouter from './routes/categories';
import rulesRouter from './routes/rules';
import auditRouter from './routes/audit';
import networthRouter from './routes/networth';
import adviceLibraryRouter from './routes/advice';
import wealthRouter from './routes/wealth';
import investmentIntelRouter from './routes/investmentIntel';
import splitsRouter from './routes/splits';
import importRouter from './routes/import';
import checkpointRouter from './routes/checkpoints';
import assetsRouter from './routes/assets';
import liabilitiesRouter from './routes/liabilities';
import taxAccountsRouter from './routes/taxAccounts';
import fxRouter from './routes/fx';
import autoCategorizeRouter from './routes/autoCategorize';
import receiptsRouter from './routes/receipts';
import emailConnectorRouter from './routes/emailConnector';
import apiTokensRouter from './routes/apiTokens';
import webhooksRouter from './routes/webhooks';
import pushRouter from './routes/push';
import { requireAuth } from './middleware/auth';
import { takeNetWorthSnapshot } from './lib/netWorthJob';
import { runAccountBalanceSnapshot } from './lib/accountBalanceJob';
import { sendDigestEmail } from './lib/digestEmail';
import { runProactiveChecks } from './lib/proactiveAi';
import { runImapCheckForAllHouseholds } from './lib/imapWatcher';
import { prisma } from './lib/prisma';

// ── Startup env validation ────────────────────────────────────────────────────
const REQUIRED_ENV = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'] as const;
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[startup] Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

if (process.env.NODE_ENV === 'production' && !process.env.CLIENT_URL) {
  console.error('[startup] CLIENT_URL must be set in production');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT ?? 9002;

const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:3000';

// ── Rate limiters ─────────────────────────────────────────────────────────────
// Auth endpoints: strict limit to slow brute-force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: () => process.env.NODE_ENV === 'test',
});

// General API: generous limit to prevent abuse
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: () => process.env.NODE_ENV === 'test',
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],  // Tailwind CSS-in-JS requires this
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", clientUrl],
      fontSrc: ["'self'", 'data:'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: process.env.NODE_ENV === 'production',
}));
app.use(cors({ origin: clientUrl, credentials: true }));
// Skip compression for SSE streaming endpoints — compression buffers the response
// which breaks token-by-token delivery to the client
app.use(compression({
  filter: (req, res) => {
    if (res.getHeader('Content-Type') === 'text/event-stream') return false;
    if (req.path.includes('/stream')) return false;
    return compression.filter(req, res);
  },
}) as any);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Apply rate limiters
app.use('/api/v1/auth', authLimiter);
app.use('/api/', apiLimiter);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', name: 'Kuber API' }));

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', requireAuth, usersRouter);
app.use('/api/v1/dashboard', requireAuth, dashboardRouter);
app.use('/api/v1/accounts', requireAuth, accountsRouter);
app.use('/api/v1/transactions', requireAuth, duplicatesRouter);
app.use('/api/v1/transactions', requireAuth, transactionsRouter);
app.use('/api/v1/budgets', requireAuth, budgetsRouter);
app.use('/api/v1/cashflow', requireAuth, cashflowRouter);
app.use('/api/v1/reports/cash-flow', requireAuth, cashflowRouter);
app.use('/api/v1/reports/forecast', requireAuth, cashflowRouter);
app.use('/api/v1/reports', requireAuth, reportsRouter);
app.use('/api/v1/reports/export', requireAuth, exportsRouter);
app.use('/api/v1/recurring', requireAuth, recurringRouter);
app.use('/api/v1/goals', requireAuth, goalsRouter);
app.use('/api/v1/investments', requireAuth, investmentsRouter);
app.use('/api/v1/settings', requireAuth, settingsRouter);
app.use('/api/v1/settings', requireAuth, schedulesRouter);
app.use('/api/v1/categories', requireAuth, categoriesRouter);
app.use('/api/v1/rules', requireAuth, rulesRouter);
app.use('/api/v1/audit', requireAuth, auditRouter);
app.use('/api/v1/notifications', requireAuth, notificationsRouter);
app.use('/api/v1/advisor', requireAuth, advisorRouter);
app.use('/api/v1/networth', requireAuth, networthRouter);
app.use('/api/v1/advice', requireAuth, adviceLibraryRouter);
app.use('/api/v1/wealth', requireAuth, wealthRouter);
app.use('/api/v1/investment-intel', requireAuth, investmentIntelRouter);
app.use('/api/v1/transactions', requireAuth, splitsRouter);
app.use('/api/v1/import', requireAuth, importRouter);
app.use('/api/v1/checkpoints', requireAuth, checkpointRouter);
app.use('/api/v1/assets', requireAuth, assetsRouter);
app.use('/api/v1/liabilities', requireAuth, liabilitiesRouter);
app.use('/api/v1/tax-accounts', requireAuth, taxAccountsRouter);
app.use('/api/v1/fx', requireAuth, fxRouter);
app.use('/api/v1/auto-categorize', requireAuth, autoCategorizeRouter);
app.use('/api/v1/receipts', requireAuth, receiptsRouter);
app.use('/api/v1/email-connector', requireAuth, emailConnectorRouter);
app.use('/api/v1/settings/api-tokens', requireAuth, apiTokensRouter);
app.use('/api/v1/webhooks', requireAuth, webhooksRouter);
app.use('/api/v1/push', requireAuth, pushRouter);

function checkIfDigestDue(schedule: { frequency: string; lastSentAt: Date | null }, now: Date): boolean {
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday
  const dayOfMonth = now.getDate();

  if (schedule.frequency === 'weekly') {
    if (dayOfWeek !== 1) return false; // Only on Mondays
    if (!schedule.lastSentAt) return true;
    const msSince = now.getTime() - schedule.lastSentAt.getTime();
    return msSince > 7 * 24 * 60 * 60 * 1000;
  }

  if (schedule.frequency === 'monthly') {
    if (dayOfMonth !== 1) return false; // Only on the 1st
    if (!schedule.lastSentAt) return true;
    const msSince = now.getTime() - schedule.lastSentAt.getTime();
    return msSince > 28 * 24 * 60 * 60 * 1000;
  }

  return false;
}

setInterval(async () => {
  try {
    const now = new Date();
    const schedules = await prisma.reportSchedule.findMany({ where: { enabled: true } });
    for (const schedule of schedules) {
      const isDue = checkIfDigestDue(schedule, now);
      if (isDue) {
        console.log(`[digest-job] Sending digest for household ${schedule.householdId}`);
        await sendDigestEmail(schedule.householdId);
        await prisma.reportSchedule.update({
          where: { id: schedule.id },
          data: { lastSentAt: now },
        });
      }
    }
  } catch (err) {
    console.error('[digest-job] Error running digest check:', err);
  }
}, 60 * 60 * 1000); // every hour

// Daily proactive AI checks (runs every 24h, simulating a 7am daily job)
setInterval(async () => {
  try {
    const households = await prisma.household.findMany({ select: { id: true } });
    for (const h of households) {
      await runProactiveChecks(prisma, h.id).catch((err) =>
        console.error(`[proactive-ai] checks failed for household ${h.id}:`, err)
      );
    }
  } catch (err) {
    console.error('[proactive-ai] Error running proactive checks:', err);
  }
}, 24 * 60 * 60 * 1000); // every 24 hours

// Hourly email connector sync
setInterval(async () => {
  await runImapCheckForAllHouseholds(prisma).catch(console.error);
}, 60 * 60 * 1000);

const server = app.listen(PORT, () => {
  console.log(`Kuber server running on :${PORT}`);
  takeNetWorthSnapshot().catch((err) =>
    console.error('[networth-job] startup snapshot failed:', err),
  );
  runAccountBalanceSnapshot().catch((err) =>
    console.error('[account-balance-job] startup snapshot failed:', err),
  );
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal: string) {
  console.log(`[shutdown] ${signal} received — shutting down gracefully`);
  server.close(async () => {
    try {
      await prisma.$disconnect();
      console.log('[shutdown] Database disconnected. Bye.');
    } catch (err) {
      console.error('[shutdown] Error disconnecting database:', err);
    }
    process.exit(0);
  });
  // Force exit after 10s if connections don't drain
  setTimeout(() => {
    console.error('[shutdown] Forced exit after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
