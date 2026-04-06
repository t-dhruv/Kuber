/**
 * imapWatcher.ts
 * Optional IMAP email watcher — polls inbox for Amazon/PayPal receipts.
 * Only starts if IMAP credentials are configured in UserPreference.
 */
import { PrismaClient } from '@prisma/client';
import { parseReceiptEmail } from './emailParser.js';

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
 * Uses dynamic import of imap-simple (optional dependency).
 * Returns parsed transactions ready for import.
 */
export async function fetchReceiptEmails(
  config: ImapConfig
): Promise<Array<{ description: string; amount: number; date: string; reference?: string; source: string }>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let imapSimple: any = null;
   
  let simpleParser: ((source: string | Buffer) => Promise<{ text?: string; html?: string }>) | null = null;

  try {
    // Dynamic imports so the server starts even if packages are not yet installed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    imapSimple = await import(/* @vite-ignore */ 'imap-simple' as string) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mailparser = await import(/* @vite-ignore */ 'mailparser' as string) as any;
    simpleParser = mailparser.simpleParser as (source: string | Buffer) => Promise<{ text?: string; html?: string }>;
  } catch {
    throw new Error('imap-simple or mailparser not installed. Run: npm install imap-simple mailparser');
  }

  const connection = await imapSimple.connect({
    imap: {
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
      authTimeout: 10000,
    },
  });

  await connection.openBox('INBOX');

  // Search for unread emails from Amazon/PayPal in the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const searchCriteria = [
    'UNSEEN',
    ['SINCE', thirtyDaysAgo.toDateString()],
    ['OR',
      ['FROM', 'amazon.com'],
      ['FROM', 'paypal.com'],
    ],
  ];

  const fetchOptions = { bodies: ['HEADER.FIELDS (FROM SUBJECT DATE)', 'TEXT', ''], struct: true };

  const messages = await connection.search(searchCriteria, fetchOptions);
  const results: Array<{ description: string; amount: number; date: string; reference?: string; source: string }> = [];

  for (const message of messages) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const headerPart = message.parts.find((p: any) => p.which === 'HEADER.FIELDS (FROM SUBJECT DATE)');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bodyPart = message.parts.find((p: any) => p.which === 'TEXT');

      const from = headerPart?.body?.from?.[0] ?? '';
      const subject = headerPart?.body?.subject?.[0] ?? '';
      const rawBody = bodyPart?.body ?? '';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parseFn = simpleParser as any;
      const parsed: { text?: string; html?: string } = parseFn
        ? await parseFn(rawBody)
        : { text: rawBody, html: '' };
      const txn = parseReceiptEmail(from, subject, parsed.text ?? '', parsed.html ?? '');

      if (txn) results.push(txn);
    } catch {
      // Skip malformed messages
    }
  }

  connection.end();
  return results;
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
      const config = JSON.parse(pref.value) as ImapConfig;
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
      console.error('[imapWatcher] household check failed:', err);
    }
  }
}
