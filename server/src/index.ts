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
import { processRecurringItems } from './lib/recurringJob';
import { prisma } from './lib/prisma';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import { logger } from './lib/logger.js';
import { metricsHandler, httpRequestsTotal, httpRequestDurationSeconds,
         jobRunsTotal, jobDurationSeconds, jobLastRunTimestamp } from './lib/metrics.js';

const jobLog = logger.child({ module: 'jobs' });

// ── Startup env validation ────────────────────────────────────────────────────
const REQUIRED_ENV = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'] as const;
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    logger.fatal({ key }, 'Missing required environment variable');
    process.exit(1);
  }
}

if (process.env.NODE_ENV === 'production' && !process.env.CLIENT_URL) {
  logger.fatal('CLIENT_URL must be set in production');
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
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'"],  // Tailwind CSS-in-JS requires this
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", clientUrl],
      fontSrc: ["'self'", 'data:'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      ...(process.env.NODE_ENV === 'production' && {
        upgradeInsecureRequests: [],
      }),
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

// ── Request logging (pino-http) ───────────────────────────────────────────────
app.use(pinoHttp({
  logger,
  genReqId: () => randomUUID(),
  customReceivedMessage: (req) => `→ ${req.method} ${req.url}`,
  customSuccessMessage: (req, res) => `← ${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res, err) => `← ${req.method} ${req.url} ${res.statusCode} ${err.message}`,
  // Don't log health checks — too noisy
  autoLogging: {
    ignore: (req) => req.url === '/health',
  },
}));

// Expose request ID to clients for support/debugging (pino-http sets req.id)
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.setHeader('X-Request-Id', (req as any).id ?? '');
  next();
});

// ── HTTP metrics middleware ───────────────────────────────────────────────────
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const route = (req.route?.path as string) ?? req.path;
    const labels = { method: req.method, route, status_code: String(res.statusCode) };
    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, (Date.now() - start) / 1000);
  });
  next();
});

// Apply rate limiters
app.use('/api/v1/auth', authLimiter);
app.use('/api/', apiLimiter);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', name: 'Kuber API' }));

// Prometheus metrics — internal only (Nginx blocks external access)
app.get('/metrics', metricsHandler);

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

// Rule auto-execution: apply active rules to recent transactions every 5 minutes
import { runRuleExecutionJob } from './lib/ruleExecutionJob.js';
setInterval(async () => {
  const end = jobDurationSeconds.startTimer({ job: 'rule-execution' });
  try {
    const { processed, matched } = await runRuleExecutionJob();
    jobRunsTotal.inc({ job: 'rule-execution', status: 'success' });
    jobLastRunTimestamp.set({ job: 'rule-execution' }, Date.now() / 1000);
    jobLog.info({ processed, matched }, 'Rule execution job complete');
  } catch (err) {
    jobRunsTotal.inc({ job: 'rule-execution', status: 'failure' });
    jobLog.error({ err }, 'Rule execution job failed');
  } finally {
    end();
  }
}, 5 * 60 * 1000);

setInterval(async () => {
  const end = jobDurationSeconds.startTimer({ job: 'digest-email' });
  try {
    const now = new Date();
    const schedules = await prisma.reportSchedule.findMany({ where: { enabled: true } });
    for (const schedule of schedules) {
      const isDue = checkIfDigestDue(schedule, now);
      if (isDue) {
        jobLog.info({ householdId: schedule.householdId }, 'Sending digest email');
        await sendDigestEmail(schedule.householdId);
        await prisma.reportSchedule.update({
          where: { id: schedule.id },
          data: { lastSentAt: now },
        });
      }
    }
    jobRunsTotal.inc({ job: 'digest-email', status: 'success' });
    jobLastRunTimestamp.set({ job: 'digest-email' }, Date.now() / 1000);
  } catch (err) {
    jobRunsTotal.inc({ job: 'digest-email', status: 'failure' });
    jobLog.error({ err }, 'Digest email job failed');
  } finally {
    end();
  }
}, 60 * 60 * 1000);

// Daily proactive AI checks (runs every 24h, simulating a 7am daily job)
setInterval(async () => {
  const end = jobDurationSeconds.startTimer({ job: 'proactive-ai' });
  try {
    const households = await prisma.household.findMany({ select: { id: true } });
    for (const h of households) {
      await runProactiveChecks(prisma, h.id).catch((err) => {
        jobLog.error({ err, householdId: h.id }, 'Proactive AI check failed for household');
      });
    }
    jobRunsTotal.inc({ job: 'proactive-ai', status: 'success' });
    jobLastRunTimestamp.set({ job: 'proactive-ai' }, Date.now() / 1000);
  } catch (err) {
    jobRunsTotal.inc({ job: 'proactive-ai', status: 'failure' });
    jobLog.error({ err }, 'Proactive AI job failed');
  } finally {
    end();
  }
}, 24 * 60 * 60 * 1000);

// Hourly email connector sync
setInterval(async () => {
  const end = jobDurationSeconds.startTimer({ job: 'imap-watcher' });
  try {
    await runImapCheckForAllHouseholds(prisma);
    jobRunsTotal.inc({ job: 'imap-watcher', status: 'success' });
    jobLastRunTimestamp.set({ job: 'imap-watcher' }, Date.now() / 1000);
  } catch (err) {
    jobRunsTotal.inc({ job: 'imap-watcher', status: 'failure' });
    jobLog.error({ err }, 'IMAP watcher job failed');
  } finally {
    end();
  }
}, 60 * 60 * 1000);

// Daily recurring auto-create — runs every 24 hours
setInterval(async () => {
  const end = jobDurationSeconds.startTimer({ job: 'recurring-autocreate' });
  try {
    await processRecurringItems(prisma);
    jobRunsTotal.inc({ job: 'recurring-autocreate', status: 'success' });
    jobLastRunTimestamp.set({ job: 'recurring-autocreate' }, Date.now() / 1000);
  } catch (err) {
    jobRunsTotal.inc({ job: 'recurring-autocreate', status: 'failure' });
    jobLog.error({ err }, 'Recurring auto-create job failed');
  } finally {
    end();
  }
}, 24 * 60 * 60 * 1000);

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Kuber server started');

  const netWorthEnd = jobDurationSeconds.startTimer({ job: 'networth' });
  takeNetWorthSnapshot()
    .then(() => {
      jobRunsTotal.inc({ job: 'networth', status: 'success' });
      jobLastRunTimestamp.set({ job: 'networth' }, Date.now() / 1000);
    })
    .catch((err) => {
      jobRunsTotal.inc({ job: 'networth', status: 'failure' });
      jobLog.error({ err }, 'Startup net worth snapshot failed');
    })
    .finally(() => netWorthEnd());

  const balanceEnd = jobDurationSeconds.startTimer({ job: 'account-balance' });
  runAccountBalanceSnapshot()
    .then(() => {
      jobRunsTotal.inc({ job: 'account-balance', status: 'success' });
      jobLastRunTimestamp.set({ job: 'account-balance' }, Date.now() / 1000);
    })
    .catch((err) => {
      jobRunsTotal.inc({ job: 'account-balance', status: 'failure' });
      jobLog.error({ err }, 'Startup account balance snapshot failed');
    })
    .finally(() => balanceEnd());
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received');
  server.close(async () => {
    try {
      await prisma.$disconnect();
      logger.info('Database disconnected');
    } catch (err) {
      logger.error({ err }, 'Error disconnecting database');
    }
    process.exit(0);
  });
  // Force exit after 10s if connections don't drain
  setTimeout(() => {
    logger.error('Forced exit after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
