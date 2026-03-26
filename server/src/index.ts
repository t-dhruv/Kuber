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
import splitsRouter from './routes/splits';
import importRouter from './routes/import';
import { requireAuth } from './middleware/auth';
import { takeNetWorthSnapshot } from './lib/netWorthJob';
import { runAccountBalanceSnapshot } from './lib/accountBalanceJob';
import { sendDigestEmail } from './lib/digestEmail';
import { prisma } from './lib/prisma';

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
app.use('/api/v1/transactions', requireAuth, duplicatesRouter);
app.use('/api/v1/transactions', requireAuth, transactionsRouter);
app.use('/api/v1/budgets', requireAuth, budgetsRouter);
app.use('/api/v1/cashflow', requireAuth, cashflowRouter);
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
app.use('/api/v1/transactions', requireAuth, splitsRouter);
app.use('/api/v1/import', requireAuth, importRouter);

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

app.listen(PORT, () => {
  console.log(`Kuber server running on :${PORT}`);
  takeNetWorthSnapshot().catch((err) =>
    console.error('[networth-job] startup snapshot failed:', err),
  );
  runAccountBalanceSnapshot().catch((err) =>
    console.error('[account-balance-job] startup snapshot failed:', err),
  );
});
