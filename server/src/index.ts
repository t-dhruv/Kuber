import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import dashboardRouter from './routes/dashboard';
import accountsRouter from './routes/accounts';
import transactionsRouter from './routes/transactions';
import budgetsRouter from './routes/budgets';
import cashflowRouter from './routes/cashflow';
import reportsRouter from './routes/reports';
import recurringRouter from './routes/recurring';
import goalsRouter from './routes/goals';
import investmentsRouter from './routes/investments';
import settingsRouter from './routes/settings';
import notificationsRouter from './routes/notifications';
import advisorRouter from './routes/advisor';
import categoriesRouter from './routes/categories';
import rulesRouter from './routes/rules';
import auditRouter from './routes/audit';
import networthRouter from './routes/networth';
import { requireAuth } from './middleware/auth';
import { takeNetWorthSnapshot } from './lib/netWorthJob';

const app = express();
const PORT = process.env.PORT ?? 4000;

const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:3000';

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
  crossOriginEmbedderPolicy: false, // Allow embedding for dev
}));
app.use(cors({ origin: clientUrl, credentials: true }));
app.use(compression() as any);
app.use(express.json());
app.use(cookieParser());

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', name: 'Kuber API' }));

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', requireAuth, usersRouter);
app.use('/api/v1/dashboard', requireAuth, dashboardRouter);
app.use('/api/v1/accounts', requireAuth, accountsRouter);
app.use('/api/v1/transactions', requireAuth, transactionsRouter);
app.use('/api/v1/budgets', requireAuth, budgetsRouter);
app.use('/api/v1/cashflow', requireAuth, cashflowRouter);
app.use('/api/v1/reports', requireAuth, reportsRouter);
app.use('/api/v1/recurring', requireAuth, recurringRouter);
app.use('/api/v1/goals', requireAuth, goalsRouter);
app.use('/api/v1/investments', requireAuth, investmentsRouter);
app.use('/api/v1/settings', requireAuth, settingsRouter);
app.use('/api/v1/categories', requireAuth, categoriesRouter);
app.use('/api/v1/rules', requireAuth, rulesRouter);
app.use('/api/v1/audit', requireAuth, auditRouter);
app.use('/api/v1/notifications', requireAuth, notificationsRouter);
app.use('/api/v1/advisor', requireAuth, advisorRouter);
app.use('/api/v1/networth', requireAuth, networthRouter);

app.listen(PORT, () => {
  console.log(`Kuber server running on :${PORT}`);
  takeNetWorthSnapshot().catch((err) =>
    console.error('[networth-job] startup snapshot failed:', err),
  );
});
