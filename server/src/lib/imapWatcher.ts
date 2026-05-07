/**
 * imapWatcher.ts
 * Optional IMAP email watcher — polls inbox for Amazon/PayPal receipts.
 * Only starts if IMAP credentials are configured in UserPreference.
 */
import { PrismaClient } from '@prisma/client';
import { parseReceiptEmail } from './emailParser.js';
import { createModuleLogger } from './logger.js';
import { decryptImapConfig } from './imapConfig.js';
const log = createModuleLogger('imap');

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
  householdId: string;
  accountId?: string; // target account for imported transactions
}

/**
 * Fetch and parse recent receipt emails for a household.
 * Uses dynamic import of ImapFlow so the email connector stays optional at runtime.
 * Returns parsed transactions ready for import.
 */
export async function fetchReceiptEmails(
  config: ImapConfig
): Promise<Array<{ description: string; amount: number; date: string; reference?: string; source: string }>> {
  let ImapFlow: typeof import('imapflow').ImapFlow;
  let simpleParser: ((source: string | Buffer) => Promise<{ text?: string; html?: string }>) | null = null;

  try {
    ({ ImapFlow } = await import(/* @vite-ignore */ 'imapflow' as string));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mailparser = await import(/* @vite-ignore */ 'mailparser' as string) as any;
    simpleParser = mailparser.simpleParser as (source: string | Buffer) => Promise<{ text?: string; html?: string }>;
  } catch {
    throw new Error('imapflow or mailparser not installed. Run: npm install imapflow mailparser');
  }

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.tls,
    auth: {
      user: config.user,
      pass: config.password,
    },
    logger: false,
  });

  await client.connect();

  const lock = await client.getMailboxLock('INBOX');
  try {
    // Search for unread receipt emails in the last 30 days.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const messages = client.fetch(
      { seen: false, since: thirtyDaysAgo },
      { envelope: true, source: true }
    );

    const results: Array<{ description: string; amount: number; date: string; reference?: string; source: string }> = [];

    for await (const message of messages) {
      try {
        const from = message.envelope?.from?.map((sender) => sender.address ?? sender.name ?? '').join(', ') ?? '';
        if (!/amazon\.com|paypal\.com/i.test(from)) continue;

        const subject = message.envelope?.subject ?? '';
        const rawBody = message.source ?? Buffer.from('');
        const parsed: { text?: string; html?: string } = simpleParser
          ? await simpleParser(rawBody)
          : { text: rawBody.toString('utf8'), html: '' };

        const txn = parseReceiptEmail(from, subject, parsed.text ?? '', parsed.html ?? '');

        if (txn) results.push(txn);
      } catch {
        // Skip malformed messages
      }
    }

    return results;
  } finally {
    lock.release();
    await client.logout();
  }
}

/**
 * Test an IMAP connection with the given credentials.
 * Uses dynamic import of ImapFlow (optional dependency).
 */
export async function testImapConnection(cfg: { host: string; port: number; user: string; pass: string }): Promise<void> {
  let ImapFlow: typeof import('imapflow').ImapFlow;
  try {
    ({ ImapFlow } = await import('imapflow'));
  } catch {
    throw new Error('imapflow package not installed');
  }

  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: true,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
    logger: false,
  });

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Connection timed out')), 10_000)
  );
  const connect = client.connect().finally(async () => {
    if (client.usable) {
      await client.logout();
    }
  });

  await Promise.race([connect, timeout]);
}

/**
 * Run IMAP check for all households that have email connector configured.
 * Called by scheduled job.
 */
export async function runImapCheckForAllHouseholds(prisma: PrismaClient): Promise<void> {
  const configs = await prisma.userPreference.findMany({
    where: { key: 'imap_config' },
    select: { value: true, userId: true },
  });

  for (const pref of configs) {
    try {
      const config = decryptImapConfig(JSON.parse(pref.value) as ImapConfig & { passwordEncrypted?: boolean });
      if (!config.host || !config.user || !config.password) continue;

      const txns = await fetchReceiptEmails(config);

      for (const txn of txns) {
        // Find a suitable account for this household
        const account = config.accountId
          ? await prisma.account.findFirst({ where: { id: config.accountId, householdId: config.householdId } })
          : await prisma.account.findFirst({ where: { householdId: config.householdId, type: 'checking' } });

        if (!account) continue;

        await prisma.transaction.create({
          data: {
            householdId: config.householdId,
            accountId: account.id,
            description: txn.description,
            originalDescription: txn.description,
            amount: txn.amount,
            date: new Date(txn.date),
            needsReview: true,
          },
        });
      }
    } catch (err) {
      log.error({ err }, 'Household IMAP check failed');
    }
  }
}
