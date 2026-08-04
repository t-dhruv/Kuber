import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
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
import billsRouter from './routes/bills';
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
import reconciliationRouter from './routes/reconciliation';
import attachmentsRouter from './routes/attachments';
import transactionLinksRouter from './routes/transactionLinks';
import objectGroupsRouter from './routes/objectGroups';
import cronRouter from './routes/cron';
import systemRouter from './routes/system';
import logosRouter from './routes/logos';
import securityRouter from './routeModules/security';
import { requireAuth } from './middleware/auth';
import { logger } from './lib/logger.js';
import { metricsHandler, httpRequestsTotal, httpRequestDurationSeconds } from './lib/metrics.js';

function getRequestId(req: express.Request): string {
  const maybeRequestId = 'id' in req ? req.id : undefined;
  return typeof maybeRequestId === 'string' || typeof maybeRequestId === 'number'
    ? String(maybeRequestId)
    : '';
}

// Builds the HTTP surface: middleware, security controls and every mounted
// router. Deliberately free of side effects beyond constructing the app — it
// starts no listener, registers no cron interval and validates no environment,
// so a test can boot the real entry point against a real database without also
// starting the background job schedule. `src/index.ts` owns all of that.
//
// Each call returns a fresh app with fresh rate-limiter state, so tests do not
// leak request counts into one another.
export function createApp(): express.Express {
  const app = express();

  // ── Reverse proxy trust ───────────────────────────────────────────────────────
  // Kuber's bundled deployment puts the API behind one Nginx hop
  // (docker-compose.prod.yml → nginx/prod.conf), which sets X-Forwarded-For.
  // Express must be told how many proxy hops to trust so that req.ip — and
  // therefore express-rate-limit's bucket key — resolves to the real client
  // rather than the proxy's container IP.
  //
  // This is deliberately a HOP COUNT, never `true`: with `true`, Express takes
  // the left-most X-Forwarded-For entry, which any client can forge, turning
  // rate limiting into a bypass. A hop count reads the Nth entry from the right,
  // which a client cannot forge.
  //
  // TRUST_PROXY=0 disables it (use when the API is exposed directly).
  function trustProxyHops(): number {
    const raw = process.env.TRUST_PROXY;
    if (raw === undefined || raw === '') return 1;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
  }

  const trustProxy = trustProxyHops();
  app.set('trust proxy', trustProxy);
  logger.info({ trustProxy }, 'reverse proxy hops trusted');


  const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:3000';

  // ── Rate limiters ─────────────────────────────────────────────────────────────
  function positiveIntEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  // All three limiters used to carry `skip: () => NODE_ENV === 'test'`, which
  // made the only control protecting login untestable — and therefore untested.
  // They now run in every environment, exactly as a Self-hoster runs them; a
  // test that does not want to be limited raises its own limit through the env
  // vars below, and tests/db/entryPointSecurity.test.ts asserts the bucketing.

  // Auth endpoints: strict limit to slow brute-force attacks
  const authLimiter = rateLimit({
    windowMs: positiveIntEnv('AUTH_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    max: positiveIntEnv('AUTH_RATE_LIMIT_MAX', 50),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });

  // Logos: unauthenticated by necessity — the client loads these as <img src>,
  // which cannot carry an Authorization header — and a cache miss triggers
  // outbound fetches. Limit it far more tightly than the general API.
  const logoLimiter = rateLimit({
    windowMs: positiveIntEnv('LOGO_RATE_LIMIT_WINDOW_MS', 60 * 1000),
    max: positiveIntEnv('LOGO_RATE_LIMIT_MAX', 120),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });

  // General API: generous limit to prevent abuse
  const apiLimiter = rateLimit({
    windowMs: positiveIntEnv('API_RATE_LIMIT_WINDOW_MS', 60 * 1000),
    max: positiveIntEnv('API_RATE_LIMIT_MAX', 2000),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
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
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // ── Request logging (pino-http) ───────────────────────────────────────────────
  app.use(pinoHttp({
    logger,
    genReqId: () => randomUUID(),
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
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
    res.setHeader('X-Request-Id', getRequestId(req));
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
  app.use('/api/v1/logos', logoLimiter, logosRouter);
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
  app.use('/api/v1/security', requireAuth, securityRouter);
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
  app.use('/api/v1/bills', requireAuth, billsRouter);
  app.use('/api/v1/accounts', requireAuth, reconciliationRouter);
  app.use('/api/v1', requireAuth, attachmentsRouter);
  app.use('/api/v1', requireAuth, transactionLinksRouter);
  app.use('/api/v1/object-groups', requireAuth, objectGroupsRouter);
  app.use('/api/v1/cron', requireAuth, cronRouter);
  app.use('/api/v1/system', requireAuth, systemRouter);
  return app;
}
