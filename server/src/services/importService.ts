/**
 * importService.ts
 * Business logic for transaction imports, checkpoint management, and history.
 * Never imports from 'express'; receives plain args and returns plain data.
 */

import { prisma } from '../lib/prisma';
import { createCheckpoint, rollbackCheckpoint } from '../lib/checkpoint';
import { computeDedupHash } from '../lib/importDedup';
import { normalizeMerchant, buildLearningMap } from '../lib/autoCategorize';
import { createJournalFromLegacyTransaction, getVirtualAccountsByType } from '../lib/legacyToJournalMigration';
import { transactionsImportedTotal } from '../lib/metrics';

// ─── DB Writes for Import Confirmation ────────────────────────────────────────

export interface ConfirmRow {
  date: string;
  description: string;
  amount: number;
  hash: string;
  categoryId?: string;
  notes?: string;
  investmentType?: 'buy' | 'sell' | 'dividend' | 'transfer' | 'fee' | 'other';
  ticker?: string | null;
  shares?: number;
  pricePerShare?: number;
}

export async function saveImport(
  householdId: string,
  userId: string,
  accountId: string,
  rows: ConfirmRow[],
  filename?: string,
  bankSource?: string,
  batchId?: string,
) {
  const account = await prisma.account.findFirst({
    where: { id: accountId, householdId },
  });
  if (!account) return null;

  // Pre-load rule-based category suggestions
  const ruleSuggestions = await suggestCategoriesForRows(
    rows.map((r) => ({ ...r, status: 'new' as const, isDuplicate: false })),
    householdId,
  );

  const importedJournalIds: string[] = [];

  // Pre-load existing merchants to avoid N+1 inside transaction
  const existingMerchants = await prisma.merchant.findMany({
    where: { householdId },
    select: { id: true, name: true },
  });
  const merchantCache = new Map(existingMerchants.map((m) => [m.name.toLowerCase(), m.id]));

  // Load merchant learning examples once for the entire import batch
  const learningMap = await buildLearningMap(prisma, householdId);

  let imported = 0;
  let skipped = 0;
  let importedAmountSum = 0;
  const errors: Array<{ index: number; error: string }> = [];

  const isInvestmentAccount = account.type === 'investment';

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        // Anchor to noon UTC to avoid timezone off-by-one-day issues
        const rawDate = /^\d{4}-\d{2}-\d{2}$/.test(row.date)
          ? row.date + 'T12:00:00.000Z'
          : row.date;
        const txDate = new Date(rawDate);
        if (isNaN(txDate.getTime())) {
          errors.push({ index: i, error: `Invalid date: ${row.date}` });
          skipped++;
          continue;
        }

        let dividendHoldingId: string | null = null;
        if (isInvestmentAccount && row.investmentType === 'dividend') {
          // ── Investment dividend: find/create holding, create DividendRecord linked to journal ──
          const ticker = row.ticker ?? extractTicker(row.description) ?? 'UNKNOWN';
          let holding = await tx.investmentHolding.findFirst({ where: { accountId, symbol: ticker } });
          if (!holding) {
            holding = await tx.investmentHolding.create({
              data: { accountId, symbol: ticker, name: ticker, shares: 0, costBasis: 0, currentPrice: 0 },
            });
          }
          dividendHoldingId = holding.id;
        }

        if (isInvestmentAccount && (row.investmentType === 'buy' || row.investmentType === 'sell')) {
          // ── Investment buy/sell: upsert holding + create lot ──────────────
          const ticker = row.ticker ?? extractTicker(row.description) ?? 'UNKNOWN';
          const isBuy = row.investmentType === 'buy';
          const shareDelta = Math.abs(row.shares ?? 1);
          const price = row.pricePerShare ?? (shareDelta > 0 ? Math.abs(row.amount) / shareDelta : 0);

          let holding = await tx.investmentHolding.findFirst({
            where: { accountId, symbol: ticker },
          });

          if (!holding) {
            holding = await tx.investmentHolding.create({
              data: {
                accountId,
                symbol: ticker,
                name: ticker,
                shares: 0,
                costBasis: 0,
                currentPrice: price,
              },
            });
          }

          // ACB method: per-share cost basis
          const currentACB = holding.costBasis; // per-share ACB
          const newTotalShares = isBuy
            ? holding.shares + shareDelta
            : Math.max(0, holding.shares - shareDelta);
          const newACB = isBuy && newTotalShares > 0
            ? (holding.shares * currentACB + shareDelta * price) / newTotalShares
            : currentACB; // sell doesn't change per-share ACB

          await tx.investmentHolding.update({
            where: { id: holding.id },
            data: {
              shares: newTotalShares,
              costBasis: Math.round(newACB * 10000) / 10000,
              currentPrice: price,
            },
          });

          const lotNote = [row.description, batchId ? `[batch:${batchId}]` : null].filter(Boolean).join(' ');
          const realizedGain = !isBuy ? Math.round(shareDelta * (price - currentACB) * 10000) / 10000 : null;

          await tx.holdingLot.create({
            data: {
              holdingId: holding.id,
              transactionType: isBuy ? 'buy' : 'sell',
              date: txDate,
              shares: isBuy ? shareDelta : -shareDelta,
              pricePerShare: price,
              acbPerShareAtSale: !isBuy ? currentACB : null,
              realizedGainDecimal: realizedGain,
              note: lotNote || null,
              status: 'confirmed',
            },
          });
        }

        // Always create a transaction record (for cash flow tracking regardless of type)
        // Resolve category: user override → rules engine → learning map → uncategorized
        const resolvedCategoryId =
          row.categoryId ??
          ruleSuggestions.get(row.hash)?.categoryId ??
          learningMap.get(normalizeMerchant(row.description)) ??
          null;

        // Resolve merchant from pre-loaded cache — create only if genuinely new
        const merchantName = row.description.split(/[#\d]/)[0].trim();
        const merchantKey = merchantName.toLowerCase();
        let merchantId: string | null = merchantCache.get(merchantKey) ?? null;
        if (!merchantId && merchantName.length > 2) {
          const created = await tx.merchant.create({
            data: { householdId, name: merchantName, displayName: merchantName },
          });
          merchantId = created.id;
          merchantCache.set(merchantKey, merchantId);
        }

        const batchNote = batchId ? `[batch:${batchId}]` : null;
        const notes = [row.notes, batchNote].filter(Boolean).join(' ') || null;

        // Reuse existing virtual accounts when present; journal creation will create missing ones.
        const virtualAccounts = await getVirtualAccountsByType(householdId);

        // Create journal instead of legacy transaction
        const meta: Record<string, string> = {};
        if (merchantId) meta.legacyMerchantId = merchantId;
        if (bankSource) meta.bankSource = bankSource;
        if (batchId) meta.batchId = batchId;

        const journalResult = await createJournalFromLegacyTransaction(
          tx,
          {
            householdId,
            accountId,
            date: txDate,
            description: row.description,
            amount: row.amount,
            categoryId: resolvedCategoryId ?? undefined,
            notes: notes ?? undefined,
          },
          row.amount < 0 ? (virtualAccounts.expenseAccountId ?? undefined) : undefined,
          row.amount > 0 ? (virtualAccounts.revenueAccountId ?? undefined) : undefined,
        );

        if (dividendHoldingId) {
          await tx.dividendRecord.create({
            data: {
              holdingId: dividendHoldingId,
              date: txDate,
              amountDecimal: Math.abs(row.amount),
              currencyCode: 'CAD',
              journalId: journalResult.journalId,
            },
          });
        }

        // Persist dedup hash so future imports can fingerprint-check against it
        await tx.transactionJournalMeta.create({
          data: { journalId: journalResult.journalId, name: 'importHash', value: row.hash },
        });

        importedJournalIds.push(journalResult.journalId);
        importedAmountSum += row.amount;
        imported++;
      } catch (err) {
        errors.push({ index: i, error: err instanceof Error ? err.message : 'Unknown error' });
        skipped++;
      }
    }
  });

  // Update account running balance with sum of imported transaction amounts
  if (imported > 0) {
    await prisma.account.update({
      where: { id: accountId },
      data: { balance: { increment: importedAmountSum } },
    });
  }

  // Create rollback checkpoint
  if (imported > 0) {
    await createCheckpoint(
      prisma,
      householdId,
      'bulk-import',
      `Imported ${imported} rows from ${filename ?? 'unknown'}`,
      importedJournalIds,
    );
  }

  // Record import history
  await prisma.importHistory.create({
    data: {
      householdId,
      filename: filename ?? 'unknown',
      bankSource: bankSource ?? 'generic',
      rowsTotal: rows.length,
      rowsImported: imported,
      rowsDuplicate: 0,
      rowsSkipped: skipped,
      status: errors.length > 0 ? 'partial' : 'completed',
      journalIds: importedJournalIds,
    },
  });

  if (imported > 0) {
    transactionsImportedTotal.inc({ household_id: householdId, source: bankSource ?? 'generic' });
  }

  return { imported, skipped, errors };
}

// ─── Import Sessions ──────────────────────────────────────────────────────────

export async function getImportSessions(householdId: string, page: number = 1, limit: number = 20) {
  const skip = (page - 1) * limit;
  const safeLimit = Math.min(limit, 100);

  const [items, total] = await Promise.all([
    prisma.importHistory.findMany({
      where: { householdId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: safeLimit,
    }),
    prisma.importHistory.count({ where: { householdId } }),
  ]);

  return { items, total, page, limit: safeLimit };
}

export async function getImportSession(householdId: string, id: string) {
  const session = await prisma.importHistory.findFirst({
    where: { id, householdId },
  });
  return session;
}

export async function deleteImportSession(householdId: string, id: string) {
  const session = await prisma.importHistory.findFirst({
    where: { id, householdId },
  });
  if (!session) return null;

  await prisma.importHistory.delete({ where: { id } });
  return { message: 'Import session deleted' };
}

export async function undoImportSession(householdId: string, checkpointId: string) {
  await rollbackCheckpoint(prisma, householdId, checkpointId);
  return { message: 'Import rolled back successfully' };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type RuleCondition = { field: 'merchantName' | 'description' | 'amount'; operator: 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'gt' | 'lt' | 'gte' | 'lte'; value: string | number };
type RuleAction    = { type: 'setCategory' | 'addTag' | 'hide' | 'markReviewed'; value?: string };

function evalRuleCond(cond: RuleCondition, tx: { description: string; amount: number }): boolean {
  if (cond.field === 'amount') {
    const n = tx.amount;
    const v = typeof cond.value === 'number' ? cond.value : parseFloat(cond.value as string);
    switch (cond.operator) {
      case 'equals': return n === v;
      case 'gt': return n > v;
      case 'lt': return n < v;
      case 'gte': return n >= v;
      case 'lte': return n <= v;
      default: return false;
    }
  } else {
    const s = tx.description.toLowerCase();
    const v = String(cond.value).toLowerCase();
    switch (cond.operator) {
      case 'contains': return s.includes(v);
      case 'equals': return s === v;
      case 'startsWith': return s.startsWith(v);
      case 'endsWith': return s.endsWith(v);
      default: return false;
    }
  }
}

interface ParsedRowForSuggestion {
  status: 'new' | 'duplicate' | 'invalid';
  isDuplicate: boolean;
  description: string;
  amount: number;
  hash: string;
}

async function suggestCategoriesForRows(
  rows: ParsedRowForSuggestion[],
  householdId: string,
): Promise<Map<string, { categoryId: string; categoryName: string } | null>> {
  const [rules, categories] = await Promise.all([
    prisma.rule.findMany({ where: { householdId, isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.category.findMany({ where: { householdId }, select: { id: true, name: true } }),
  ]);

  const catMap = new Map(categories.map((c) => [c.id, c.name]));

  const activeRules = rules
    .map((r) => ({ conditions: r.conditions as RuleCondition[], actions: r.actions as RuleAction[] }))
    .filter((r) => r.actions.some((a) => a.type === 'setCategory' && a.value));

  const result = new Map<string, { categoryId: string; categoryName: string } | null>();

  for (const row of rows) {
    if (row.status !== 'new') { result.set(row.hash, null); continue; }
    let matched: { categoryId: string; categoryName: string } | null = null;
    for (const rule of activeRules) {
      const tx = { description: row.description, amount: row.amount };
      if (rule.conditions.every((c) => evalRuleCond(c, tx))) {
        const action = rule.actions.find((a) => a.type === 'setCategory' && a.value);
        if (action?.value) {
          matched = { categoryId: action.value, categoryName: catMap.get(action.value) ?? 'Unknown' };
          break;
        }
      }
    }
    result.set(row.hash, matched);
  }

  return result;
}

function extractTicker(description: string): string | null {
  const match = description.match(/\b([A-Z]{1,5}(?:\.[A-Z]{1,2})?)\b/);
  return match?.[1] ?? null;
}
