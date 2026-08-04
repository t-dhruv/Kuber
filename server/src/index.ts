import { createApp } from './app.js';
import { registerJob }  from './lib/cronRegistry';
import { takeNetWorthSnapshot } from './lib/netWorthJob';
import { runAccountBalanceSnapshot } from './lib/accountBalanceJob';
import { sendDigestEmail } from './lib/digestEmail';
import { runProactiveChecks } from './lib/proactiveAi';
import { runImapCheckForAllHouseholds } from './lib/imapWatcher';
import { processRecurringItems } from './lib/recurringJob';
import { runLogoFetchJob } from './lib/logoFetchJob.js';
import { runCategoryBucketJob } from './lib/categoryBucketJob';
import { runIconAssignmentJob } from './lib/iconAssignmentJob.js';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger.js';
import { warnIfCookiesInsecure } from './lib/cookies.js';
import { jobRunsTotal, jobDurationSeconds, jobLastRunTimestamp } from './lib/metrics.js';

const jobLog = logger.child({ module: 'jobs' });

// ── Cron job registry ─────────────────────────────────────────────────────────
// Register all recurring jobs so they are visible via GET /api/v1/cron/jobs
// and triggerable via POST /api/v1/cron/jobs/:name/trigger.
registerJob('rule-execution', async () => {
  const { runRuleExecutionJob } = await import('./lib/ruleExecutionJob.js');
  await runRuleExecutionJob();
});
registerJob('auto-budget', async () => {
  const { runAutoBudget } = await import('./lib/autoBudgetJob.js');
  await runAutoBudget(prisma);
});
registerJob('net-worth-snapshot', async () => {
  await takeNetWorthSnapshot();
});
registerJob('account-balance-snapshot', async () => {
  await runAccountBalanceSnapshot();
});
registerJob('recurring-autocreate', async () => {
  await processRecurringItems(prisma);
});
registerJob('logo-fetch', runLogoFetchJob);
registerJob('category-bucket-assign', async () => {
  await runCategoryBucketJob();
});
registerJob('icon-assignment', async () => {
  await runIconAssignmentJob();
});

// ── Startup env validation ────────────────────────────────────────────────────
const REQUIRED_ENV = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL', 'AI_ENCRYPTION_KEY'] as const;
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    logger.fatal({ key }, 'Missing required environment variable');
    process.exit(1);
  }
}

if (process.env.AI_ENCRYPTION_KEY && process.env.AI_ENCRYPTION_KEY.length !== 64) {
  logger.fatal('AI_ENCRYPTION_KEY must be a 64-char hex string (32 bytes). Generate with: node -e "require(\'crypto\').randomBytes(32).toString(\'hex\')"');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production' && !process.env.CLIENT_URL) {
  logger.fatal('CLIENT_URL must be set in production');
  process.exit(1);
}

warnIfCookiesInsecure();

const app = createApp();

const PORT = process.env.PORT ?? 9002;

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

// Daily logo fetch — runs every 24 hours to pre-warm logo cache
setInterval(async () => {
  const end = jobDurationSeconds.startTimer({ job: 'logo-fetch' });
  try {
    await runLogoFetchJob();
    jobRunsTotal.inc({ job: 'logo-fetch', status: 'success' });
    jobLastRunTimestamp.set({ job: 'logo-fetch' }, Date.now() / 1000);
  } catch (err) {
    jobRunsTotal.inc({ job: 'logo-fetch', status: 'failure' });
    jobLog.error({ err }, 'Logo fetch job failed');
  } finally {
    end();
  }
}, 24 * 60 * 60 * 1000);

// Daily category bucket assignment — runs every 24 hours to auto-assign bucket types
setInterval(async () => {
  const end = jobDurationSeconds.startTimer({ job: 'category-bucket-assign' });
  try {
    const { updated, skipped } = await runCategoryBucketJob();
    jobRunsTotal.inc({ job: 'category-bucket-assign', status: 'success' });
    jobLastRunTimestamp.set({ job: 'category-bucket-assign' }, Date.now() / 1000);
    jobLog.info({ updated, skipped }, 'Category bucket assignment job complete');
  } catch (err) {
    jobRunsTotal.inc({ job: 'category-bucket-assign', status: 'failure' });
    jobLog.error({ err }, 'Category bucket assignment job failed');
  } finally {
    end();
  }
}, 24 * 60 * 60 * 1000);

// Daily icon assignment — runs every 24 hours to assign icons to categories missing them
setInterval(async () => {
  const end = jobDurationSeconds.startTimer({ job: 'icon-assignment' });
  try {
    const { assigned, skipped } = await runIconAssignmentJob();
    jobRunsTotal.inc({ job: 'icon-assignment', status: 'success' });
    jobLastRunTimestamp.set({ job: 'icon-assignment' }, Date.now() / 1000);
    jobLog.info({ assigned, skipped }, 'Icon assignment job complete');
  } catch (err) {
    jobRunsTotal.inc({ job: 'icon-assignment', status: 'failure' });
    jobLog.error({ err }, 'Icon assignment job failed');
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
