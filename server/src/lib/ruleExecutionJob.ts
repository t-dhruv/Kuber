import { prisma } from './prisma';
import { applyActiveRulesToJournal } from './ruleEngine';
import { buildRuleMatchInputFromJournal } from './transactionJournalService';

const LOOKBACK_HOURS = 24;

/**
 * Applies all active household rules to journals created in the last lookback.
 * Phase 2 intentionally runs on transaction journals, not legacy flat rows.
 */
export async function runRuleExecutionJob(): Promise<{ processed: number; matched: number }> {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);

  const journals = await prisma.transactionJournal.findMany({
    where: { createdAt: { gte: since }, isDeleted: false },
    include: {
      entries: true,
      tags: { include: { tag: true } },
      meta: true,
      category: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  let processed = 0;
  let matched = 0;

  for (const journal of journals) {
    const fired = await applyActiveRulesToJournal(prisma, {
      journalId: journal.id,
      householdId: journal.householdId,
      matchInput: buildRuleMatchInputFromJournal(journal),
    });
    processed++;
    matched += fired.length;
  }

  return { processed, matched };
}
