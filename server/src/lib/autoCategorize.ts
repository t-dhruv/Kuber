/**
 * autoCategorize.ts
 * AI-powered transaction categorization.
 * Uses the household's configured AI provider (same as advisor).
 * Gracefully returns null if no provider configured.
 */
import { PrismaClient } from '@prisma/client';
import { getAiClientForHousehold, type AiProviderClient } from './ai/index.js';
import { ruleMatches } from './ruleEngine.js';

const BATCH_CHUNK_SIZE = 30;

/**
 * Normalize a transaction description to a merchant key.
 * Strips trailing order codes, reference IDs, and noise so that
 * "AMAZON.CA* B70MA7890" and "AMAZON.CA* BY0TE4C51" both map to "amazon.ca".
 */
export function normalizeMerchant(description: string): string {
  return description
    .toLowerCase()
    // Remove trailing alphanumeric codes after * or # or common separators
    .replace(/[*#]\s*[a-z0-9]{4,}$/gi, '')
    // Remove pure numeric/alphanumeric suffixes (order IDs, ref codes)
    .replace(/\s+[a-z0-9]{6,}$/gi, '')
    // Remove transaction IDs in parens/brackets
    .replace(/[[(][^]\s]*]{4,}[\])]/g, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

// ── In-memory job progress store ──────────────────────────────────────────────
export interface BatchJobState {
  total: number;
  processed: number;
  queued: number;
  skipped: number;
  done: boolean;
  notConfigured: boolean;
}

const batchJobs = new Map<string, BatchJobState>();

export function getBatchJobState(jobId: string): BatchJobState | null {
  return batchJobs.get(jobId) ?? null;
}

/** Clean up jobs older than 10 minutes to avoid unbounded memory growth */
const jobTimestamps = new Map<string, number>();
function pruneOldJobs() {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, ts] of jobTimestamps) {
    if (ts < cutoff) {
      batchJobs.delete(id);
      jobTimestamps.delete(id);
    }
  }
}

export interface CategorySuggestion {
  categoryId: string | null;       // null = no existing category matched
  categoryName: string;
  suggestedNewName: string | null; // non-null when categoryId is null
  confidence: number;              // 0-1
}

interface TxnInput { id: string; description: string; amount: number }
type CategoryRow = { id: string; name: string; type: string };
type ExampleRow  = { descriptionPattern: string; correctCategory: { name: string } };

function buildBatchPrompt(
  txns: TxnInput[],
  categories: CategoryRow[],
  examples: ExampleRow[],
): string {
  const categoryList = categories.map((c) => c.name).join(', ');
  const fewShotSection = examples.length > 0
    ? `\nPast corrections (learn from these):\n${examples.map((e) => `- "${e.descriptionPattern}" → ${e.correctCategory.name}`).join('\n')}\n`
    : '';
  const txnLines = txns
    .map((t, i) => `t${i}: "${t.description}" (${t.amount < 0 ? 'expense' : 'income'}, $${Math.abs(t.amount).toFixed(2)})`)
    .join('\n');

  return `You are a transaction categorizer. For each transaction, pick the BEST category from the list. If none fit, suggest a new name and set noMatch to true.
Respond with ONLY a JSON object where each key is the transaction tag (t0, t1, …) and each value is: {"category": "ExactName", "confidence": 0.0-1.0, "noMatch": false}
${fewShotSection}
Available categories: ${categoryList}

Transactions:
${txnLines}`;
}

function parseSuggestion(
  raw: unknown,
  categories: CategoryRow[],
): CategorySuggestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const rawName = (typeof obj.category === 'string' ? obj.category : '').trim();
  const confidence = parseFloat(String(obj.confidence ?? 0)) || 0;
  const noMatch = Boolean(obj.noMatch);

  if (!rawName || confidence < 0.5) return null;

  const suggestedName = rawName.replace(/\s*\((expense|income|transfer)\)\s*$/i, '').trim();
  const matched = categories.find((c) => c.name.toLowerCase() === suggestedName.toLowerCase());

  if (!matched || noMatch) {
    return { categoryId: null, categoryName: suggestedName, suggestedNewName: suggestedName, confidence };
  }
  return { categoryId: matched.id, categoryName: matched.name, suggestedNewName: null, confidence };
}

/**
 * Deduplicate transactions by normalized merchant key.
 * Returns:
 *   - `representatives`: one TxnInput per unique merchant (sent to AI)
 *   - `keyById`: txn id → normalized key (used to fan results back)
 *   - `groupByKey`: key → all txn ids in that group
 */
function deduplicateByMerchant(txns: TxnInput[]): {
  representatives: TxnInput[];
  keyById: Map<string, string>;
  groupByKey: Map<string, string[]>;
} {
  const keyById     = new Map<string, string>();
  const groupByKey  = new Map<string, string[]>();
  const firstByKey  = new Map<string, TxnInput>();

  for (const txn of txns) {
    const key = normalizeMerchant(txn.description);
    keyById.set(txn.id, key);

    const group = groupByKey.get(key);
    if (group) {
      group.push(txn.id);
    } else {
      groupByKey.set(key, [txn.id]);
      firstByKey.set(key, txn);
    }
  }

  return { representatives: Array.from(firstByKey.values()), keyById, groupByKey };
}

/**
 * Suggest categories for a batch of transactions in a single AI call.
 * Returns a map of txn id → CategorySuggestion (only entries with confidence ≥ 0.5).
 */
async function suggestCategoriesBatch(
  client: AiProviderClient,
  txns: TxnInput[],
  categories: CategoryRow[],
  examples: ExampleRow[],
): Promise<Map<string, CategorySuggestion>> {
  const results = new Map<string, CategorySuggestion>();
  if (txns.length === 0) return results;

  const prompt = buildBatchPrompt(txns, categories, examples);

  try {
    const result = await client.complete({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 60 * txns.length + 100,
      temperature: 0.1,
    });

    const jsonStr = result.content.match(/\{[\s\S]*\}/)?.[0] ?? '{}';
    const parsed: Record<string, unknown> = JSON.parse(jsonStr);

    for (let i = 0; i < txns.length; i++) {
      const entry = parsed[`t${i}`];
      const suggestion = parseSuggestion(entry, categories);
      if (suggestion) results.set(txns[i].id, suggestion);
    }
  } catch {
    // If parse fails, entire chunk is skipped — individual txns not penalised
  }

  return results;
}

/**
 * Suggest a category for a single transaction description.
 * Returns null if AI not configured or confidence < 0.5.
 */
export async function suggestCategory(
  prisma: PrismaClient,
  householdId: string,
  description: string,
  amount: number
): Promise<CategorySuggestion | null> {
  const [categories, examples] = await Promise.all([
    prisma.category.findMany({ where: { householdId }, select: { id: true, name: true, type: true } }),
    prisma.categoryLearningExample.findMany({
      where: { householdId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { correctCategory: { select: { name: true } } },
    }),
  ]);

  if (categories.length === 0) return null;

  let client;
  try {
    client = await getAiClientForHousehold(householdId, prisma);
  } catch {
    return null;
  }

  const map = await suggestCategoriesBatch(client, [{ id: 'single', description, amount }], categories, examples);
  return map.get('single') ?? null;
}

/**
 * Batch auto-categorize uncategorized transactions.
 * 1. Clears existing review queue (fresh start).
 * 2. Applies matching rules directly (no AI needed, no review queue).
 * 3. For remaining uncategorized transactions, calls AI and queues for review.
 * Returns a jobId immediately; AI processing runs asynchronously.
 * Poll getBatchJobState(jobId) for progress.
 */
export async function startBatchAutoCategorize(
  prisma: PrismaClient,
  householdId: string,
  limit = 1000
): Promise<{ jobId: string; total: number; notConfigured: boolean }> {
  pruneOldJobs();

  let client: AiProviderClient;
  try {
    client = await getAiClientForHousehold(householdId, prisma);
  } catch {
    return { jobId: '', total: 0, notConfigured: true };
  }

  // Clear stale AI suggestions so we start fresh
  await prisma.transaction.updateMany({
    where: {
      householdId,
      needsReview: true,
      categoryId: null,
    },
    data: {
      needsReview: false,
      aiSuggestedCategoryId: null,
      aiSuggestedCategoryName: null,
      aiSuggestionConfidence: null,
    },
  });

  // Load active rules to apply before AI
  const rules = await prisma.rule.findMany({
    where: { householdId, isActive: true },
    orderBy: { sortOrder: 'asc' },
  });

  const uncategorized = await prisma.transaction.findMany({
    where: { householdId, categoryId: null, isHidden: false, needsReview: false },
    orderBy: { date: 'desc' },
    take: limit,
    select: { id: true, description: true, amount: true, merchantId: true, notes: true },
  });

  // Apply rules first — direct category assignment, no review needed
  const needsAi: typeof uncategorized = [];
  for (const txn of uncategorized) {
    let ruleApplied = false;
    for (const rule of rules) {
      const conditions = rule.conditions as import('./ruleEngine.js').RuleCondition[];
      const actions    = rule.actions    as import('./ruleEngine.js').RuleAction[];
      const setCatAction = actions.find(a => a.type === 'setCategory' && a.value);
      if (!setCatAction) continue;

      const matchInput: import('./ruleEngine.js').RuleMatchInput = {
        description: txn.description,
        amount:      txn.amount,
        notes:       txn.notes,
      };
      if (ruleMatches(conditions, matchInput)) {
        await prisma.transaction.update({
          where: { id: txn.id },
          data: { categoryId: setCatAction.value!, needsReview: false },
        });
        ruleApplied = true;
        break;
      }
    }
    if (!ruleApplied) needsAi.push(txn);
  }

  const jobId = `${householdId}-${Date.now()}`;
  const state: BatchJobState = {
    total: needsAi.length,
    processed: 0,
    queued: 0,
    skipped: uncategorized.length - needsAi.length, // rule-applied count
    done: needsAi.length === 0,
    notConfigured: false,
  };
  batchJobs.set(jobId, state);
  jobTimestamps.set(jobId, Date.now());

  if (needsAi.length > 0) {
    // Hoist shared context — fetched once, reused across all chunks
    const [categories, examples] = await Promise.all([
      prisma.category.findMany({ where: { householdId }, select: { id: true, name: true, type: true } }),
      prisma.categoryLearningExample.findMany({
        where: { householdId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { correctCategory: { select: { name: true } } },
      }),
    ]);

    // Deduplicate by merchant before chunking — "AMAZON* ABC123" and "AMAZON* XYZ456"
    // collapse to one representative; result fans back to all txns in the group.
    const { representatives, keyById, groupByKey } = deduplicateByMerchant(needsAi);

    // Fire and forget — processes deduplicated representatives in chunks
    (async () => {
      for (let i = 0; i < representatives.length; i += BATCH_CHUNK_SIZE) {
        const chunk = representatives.slice(i, i + BATCH_CHUNK_SIZE);
        try {
          // AI sees one entry per unique merchant
          const suggestions = await suggestCategoriesBatch(client, chunk, categories, examples);

          // Fan each representative's result back to all txns sharing that merchant key
          const updates: Promise<unknown>[] = [];
          for (const rep of chunk) {
            const suggestion = suggestions.get(rep.id);
            const siblingIds = groupByKey.get(keyById.get(rep.id)!) ?? [rep.id];

            for (const txnId of siblingIds) {
              if (suggestion) {
                updates.push(
                  prisma.transaction.updateMany({
                    where: { id: txnId, categoryId: null },
                    data: {
                      needsReview: true,
                      aiSuggestedCategoryId: suggestion.categoryId ?? null,
                      aiSuggestedCategoryName: suggestion.suggestedNewName ?? null,
                      aiSuggestionConfidence: suggestion.confidence,
                    },
                  })
                );
                state.queued++;
              } else {
                state.skipped++;
              }
            }
          }
          await Promise.all(updates);
        } catch {
          // Count all txns (not just reps) that belong to this chunk
          const affected = chunk.reduce(
            (sum, rep) => sum + (groupByKey.get(keyById.get(rep.id)!) ?? [rep.id]).length,
            0,
          );
          state.skipped += affected;
        }
        // Processed count tracks original txns, not deduplicated reps
        const chunkTxnCount = chunk.reduce(
          (sum, rep) => sum + (groupByKey.get(keyById.get(rep.id)!) ?? [rep.id]).length,
          0,
        );
        state.processed += chunkTxnCount;
      }
      state.done = true;
    })();
  }

  return { jobId, total: needsAi.length, notConfigured: false };
}

/** @deprecated Use startBatchAutoCategorize for async progress support */
export async function batchAutoCategorize(
  prisma: PrismaClient,
  householdId: string,
  limit = 1000
): Promise<{ queued: number; skipped: number; notConfigured: boolean }> {
  const { jobId, notConfigured, total } = await startBatchAutoCategorize(prisma, householdId, limit);
  if (notConfigured) return { queued: 0, skipped: 0, notConfigured: true };
  if (total === 0) return { queued: 0, skipped: 0, notConfigured: false };

  // Wait for job to complete (sync wrapper for backwards compat)
  const state = getBatchJobState(jobId)!;
  while (!state.done) {
    await new Promise((r) => setTimeout(r, 200));
  }
  return { queued: state.queued, skipped: state.skipped, notConfigured: false };
}

/**
 * Detect rule suggestions from current review queue.
 * Groups transactions by first token of description where 3+ share the same suggested category.
 */
export async function detectRuleSuggestions(
  prisma: PrismaClient,
  householdId: string
): Promise<Array<{
  pattern: string;
  value: string;
  suggestedCategoryId: string | null;
  suggestedCategoryName: string;
  matchCount: number;
}>> {
  const existingRules = await prisma.rule.findMany({
    where: { householdId, isActive: true },
    select: { conditions: true },
  });

  const existingPatterns = new Set<string>(
    existingRules.flatMap((r) => {
      const conds = r.conditions as Array<{ field?: string; operator?: string; value?: string }>;
      return conds
        .filter((c) => c.field === 'description' && c.operator === 'contains' && c.value)
        .map((c) => c.value!.toLowerCase().trim());
    })
  );

  const reviewQueue = await prisma.transaction.findMany({
    where: {
      householdId,
      needsReview: true,
      OR: [
        { aiSuggestedCategoryId: { not: null } },
        { aiSuggestedCategoryName: { not: null } },
      ],
    },
    select: {
      description: true,
      aiSuggestedCategoryId: true,
      aiSuggestedCategoryName: true,
      aiSuggestedCategory: { select: { name: true } },
    },
  });

  const groups = new Map<string, {
    value: string;
    suggestedCategoryId: string | null;
    suggestedCategoryName: string;
    count: number;
  }>();

  for (const txn of reviewQueue) {
    const firstToken = txn.description.toLowerCase().split(/[\s_-]/)[0].trim();
    if (!firstToken || firstToken.length < 3) continue;

    const catId = txn.aiSuggestedCategoryId ?? null;
    const catName = txn.aiSuggestedCategory?.name ?? txn.aiSuggestedCategoryName ?? '';
    const key = `${firstToken}::${catId ?? catName}`;

    const existing = groups.get(key);
    if (existing) {
      existing.count++;
    } else {
      groups.set(key, {
        value: firstToken,
        suggestedCategoryId: catId,
        suggestedCategoryName: catName,
        count: 1,
      });
    }
  }

  return Array.from(groups.values())
    .filter((g) => g.count >= 3 && !existingPatterns.has(g.value.toLowerCase()))
    .map((g) => ({
      pattern: `description contains "${g.value}"`,
      value: g.value,
      suggestedCategoryId: g.suggestedCategoryId,
      suggestedCategoryName: g.suggestedCategoryName,
      matchCount: g.count,
    }));
}
