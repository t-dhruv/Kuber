/**
 * emailConnector.ts
 * API for managing the optional IMAP email connector.
 * Credentials are encrypted before being stored in UserPreference key 'imap_config'.
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, requireHouseholdRole } from '../middleware/auth.js';
import { fetchReceiptEmails } from '../lib/imapWatcher.js';
import { decryptImapConfig, encryptImapConfig } from '../lib/imapConfig.js';
import { createJournalFromLegacyTransaction, getVirtualAccountsByType } from '../lib/legacyToJournalMigration.js';

const router = Router();
const requireHouseholdAdmin = requireHouseholdRole(['owner', 'admin']);

const ImapConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(993),
  user: z.string().email(),
  password: z.string().min(1),
  tls: z.boolean().default(true),
  accountId: z.string().optional(),
});

// GET /api/v1/email-connector/config — get current config (password masked)
router.get('/config', requireHouseholdAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const pref = await prisma.userPreference.findFirst({
      where: { userId: req.userId!, key: 'imap_config' },
    });
    if (!pref) return res.json({ configured: false });

    const config = JSON.parse(pref.value);
    return res.json({
      configured: true,
      host: config.host,
      port: config.port,
      user: config.user,
      tls: config.tls,
      accountId: config.accountId,
      // never return password
    });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/email-connector/config — save IMAP config
router.put('/config', requireHouseholdAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const parse = ImapConfigSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

    // Get householdId to store in config
    const member = await prisma.householdMember.findFirst({ where: { userId: req.userId! } });
    if (!member) return res.status(400).json({ error: 'No household found' });

    const configValue = JSON.stringify(encryptImapConfig({ ...parse.data, householdId: member.householdId }));

    await prisma.userPreference.upsert({
      where: { userId_key: { userId: req.userId!, key: 'imap_config' } },
      create: { userId: req.userId!, key: 'imap_config', value: configValue },
      update: { value: configValue },
    });

    return res.json({ message: 'Email connector configured' });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/email-connector/config — remove config
router.delete('/config', requireHouseholdAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.userPreference.deleteMany({ where: { userId: req.userId!, key: 'imap_config' } });
    return res.json({ message: 'Email connector removed' });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/email-connector/test — test connection + fetch preview
router.post('/test', requireHouseholdAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const parse = ImapConfigSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

    const member = await prisma.householdMember.findFirst({ where: { userId: req.userId! } });
    const config = { ...parse.data, householdId: member?.householdId ?? '' };

    const txns = await fetchReceiptEmails(config);
    return res.json({ success: true, found: txns.length, preview: txns.slice(0, 3) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Connection failed';
    return res.status(400).json({ error: msg });
  }
});

// POST /api/v1/email-connector/sync — manually trigger fetch + import
router.post('/sync', requireHouseholdAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const pref = await prisma.userPreference.findFirst({
      where: { userId: req.userId!, key: 'imap_config' },
    });
    if (!pref) return res.status(400).json({ error: 'Email connector not configured' });

    const config = decryptImapConfig(JSON.parse(pref.value));
    const txns = await fetchReceiptEmails(config);

    let imported = 0;
    for (const txn of txns) {
      const account = config.accountId
        ? await prisma.account.findFirst({ where: { id: config.accountId, householdId: config.householdId } })
        : await prisma.account.findFirst({ where: { householdId: config.householdId, type: 'checking' } });
      if (!account) continue;

      // Create email transaction as journal entry
      const virtualAccounts = await getVirtualAccountsByType(config.householdId);
      const expenseAccountId = txn.amount < 0 ? virtualAccounts.expenseAccountId : virtualAccounts.revenueAccountId;

      if (!expenseAccountId) {
        continue;
      }

      await prisma.$transaction(async (tx) => {
        await createJournalFromLegacyTransaction(
          tx,
          {
            householdId: config.householdId,
            accountId: account.id,
            description: txn.description,
            amount: txn.amount,
            date: new Date(txn.date),
          },
          txn.amount < 0 ? expenseAccountId : undefined,
          txn.amount > 0 ? expenseAccountId : undefined,
        );
      });
      imported++;
    }

    return res.json({ imported, found: txns.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sync failed';
    return res.status(500).json({ error: msg });
  }
});

export default router;
