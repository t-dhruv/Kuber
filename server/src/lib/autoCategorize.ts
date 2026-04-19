/**
 * autoCategorize.ts
 * AI-powered transaction categorization.
 * Uses the household's configured AI provider (same as advisor).
 * Gracefully returns null if no provider configured.
 */
import { PrismaClient } from '@prisma/client';
import { getAiClientForHousehold } from './ai/index.js';

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

/**
 * Suggest a category for a single transaction description.
 * Returns null if AI not configured or confidence < 0.5.
 * Returns a suggestion with categoryId=null if AI suggests a name not in the list.
 */
export async function suggestCategory(
  prisma: PrismaClient,
  householdId: string,
  description: string,
  amount: number
): Promise<CategorySuggestion | null> {
  const categories = await prisma.category.findMany({
    where: { householdId },
    select: { id: true, name: true, type: true },
  });

  if (categories.length === 0) return null;

  let client;
  try {
    client = await getAiClientForHousehold(householdId, prisma);
  } catch {
    return null;
  }

  // Fetch last 50 learning examples as few-shot context
  const examples = await prisma.categoryLearningExample.findMany({
    where: { householdId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { correctCategory: { select: { name: true } } },
  });

  const fewShotLines = examples
    .map((e) => `- "${e.descriptionPattern}" → ${e.correctCategory.name}`)
    .join('\n');

  // Send only category names (no type suffix) — type context comes from txnType below
  const categoryList = categories.map((c) => c.name).join(', ');
  const txnType = amount < 0 ? 'expense' : 'income';

  const fewShotSection = examples.length > 0
    ? `\nPast corrections (learn from these):\n${fewShotLines}\n`
    : '';

  const prompt = `You are a transaction categorizer. Given a ${txnType} transaction, pick the BEST matching category from the list. Return ONLY the exact category name from the list. If none fit well, suggest a new category name and set noMatch to true. Respond with ONLY a JSON object: {"category": "ExactCategoryName", "confidence": 0.0-1.0, "noMatch": false}
${fewShotSection}
Available categories: ${categoryList}

Transaction: "${description}" (${txnType}, $${Math.abs(amount).toFixed(2)})`;

  try {
    const result = await client.complete({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 80,
      temperature: 0.1,
    });

    const json = JSON.parse(result.content.match(/\{.*\}/s)?.[0] ?? '{}');
    const rawName = (json.category as string ?? '').trim();
    const confidence = parseFloat(json.confidence) || 0;
    const noMatch = Boolean(json.noMatch);

    if (!rawName || confidence < 0.5) return null;

    // Strip any type suffix AI may have hallucinated: "Foo (expense)" → "Foo"
    const suggestedName = rawName.replace(/\s*\((expense|income|transfer)\)\s*$/i, '').trim();

    // Exact match first, then case-insensitive
    const matched = categories.find(
      (c) => c.name.toLowerCase() === suggestedName.toLowerCase()
    );

    if (!matched || noMatch) {
      return {
        categoryId: null,
        categoryName: suggestedName,
        suggestedNewName: suggestedName,
        confidence,
      };
    }

    return {
      categoryId: matched.id,
      categoryName: matched.name,
      suggestedNewName: null,
      confidence,
    };
  } catch {
    return null;
  }
}

/**
 * Batch auto-categorize uncategorized transactions.
 * Sets needsReview=true with AI suggestion fields — does NOT apply category directly.
 * Returns a jobId immediately; processing runs asynchronously.
 * Poll getBatchJobState(jobId) for progress.
 */
export async function startBatchAutoCategorize(
  prisma: PrismaClient,
  householdId: string,
  limit = 1000
): Promise<{ jobId: string; total: number; notConfigured: boolean }> {
  pruneOldJobs();

  try {
    const client = await getAiClientForHousehold(householdId, prisma);
    void client;
  } catch {
    return { jobId: '', total: 0, notConfigured: true };
  }

  const uncategorized = await prisma.transaction.findMany({
    where: {
      householdId,
      categoryId: null,
      isHidden: false,
      // Pick up ALL uncategorized: not yet in review queue OR stale (in queue but AI fields missing)
      OR: [
        { needsReview: false },
        { needsReview: true, aiSuggestedCategoryId: null, aiSuggestedCategoryName: null },
      ],
    },
    orderBy: { date: 'desc' },
    take: limit,
    select: { id: true, description: true, amount: true },
  });

  const jobId = `${householdId}-${Date.now()}`;
  const state: BatchJobState = {
    total: uncategorized.length,
    processed: 0,
    queued: 0,
    skipped: 0,
    done: uncategorized.length === 0,
    notConfigured: false,
  };
  batchJobs.set(jobId, state);
  jobTimestamps.set(jobId, Date.now());

  if (uncategorized.length > 0) {
    // Fire and forget — runs in background
    (async () => {
      for (const txn of uncategorized) {
        try {
          const suggestion = await suggestCategory(prisma, householdId, txn.description, txn.amount);
          if (suggestion && suggestion.confidence >= 0.5) {
            await prisma.transaction.update({
              where: { id: txn.id },
              data: {
                needsReview: true,
                aiSuggestedCategoryId: suggestion.categoryId ?? null,
                aiSuggestedCategoryName: suggestion.suggestedNewName ?? null,
                aiSuggestionConfidence: suggestion.confidence,
              },
            });
            state.queued++;
          } else {
            state.skipped++;
          }
        } catch {
          state.skipped++;
        }
        state.processed++;
      }
      state.done = true;
    })();
  }

  return { jobId, total: uncategorized.length, notConfigured: false };
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
    .filter((g) => g.count >= 3)
    .map((g) => ({
      pattern: `description startsWith "${g.value}"`,
      value: g.value,
      suggestedCategoryId: g.suggestedCategoryId,
      suggestedCategoryName: g.suggestedCategoryName,
      matchCount: g.count,
    }));
}
