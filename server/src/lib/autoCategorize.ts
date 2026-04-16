/**
 * autoCategorize.ts
 * AI-powered transaction categorization.
 * Uses the household's configured AI provider (same as advisor).
 * Gracefully returns null if no provider configured.
 */
import { PrismaClient } from '@prisma/client';
import { getAiClientForHousehold } from './ai/index.js';

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

  const categoryList = categories.map((c) => `${c.name} (${c.type})`).join(', ');
  const txnType = amount < 0 ? 'expense' : 'income';

  const fewShotSection = examples.length > 0
    ? `\nPast corrections (learn from these):\n${fewShotLines}\n`
    : '';

  const prompt = `You are a transaction categorizer. Given a ${txnType} transaction, pick the BEST matching category from the list. If none fit well, suggest a new category name and set noMatch to true. Respond with ONLY a JSON object: {"category": "CategoryName", "confidence": 0.0-1.0, "noMatch": false}
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
    const suggestedName = json.category as string;
    const confidence = parseFloat(json.confidence) || 0;
    const noMatch = Boolean(json.noMatch);

    if (!suggestedName || confidence < 0.5) return null;

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
 */
export async function batchAutoCategorize(
  prisma: PrismaClient,
  householdId: string,
  limit = 50
): Promise<{ queued: number; skipped: number; notConfigured: boolean }> {
  let client;
  try {
    client = await getAiClientForHousehold(householdId, prisma);
    void client;
  } catch {
    return { queued: 0, skipped: 0, notConfigured: true };
  }

  const uncategorized = await prisma.transaction.findMany({
    where: { householdId, categoryId: null, isHidden: false, needsReview: false },
    orderBy: { date: 'desc' },
    take: limit,
    select: { id: true, description: true, amount: true },
  });

  let queued = 0;
  let skipped = 0;

  for (const txn of uncategorized) {
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
      queued++;
    } else {
      skipped++;
    }
  }

  return { queued, skipped, notConfigured: false };
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
    where: { householdId, needsReview: true },
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
    const firstToken = txn.description.toLowerCase().split(/[\s_\-]/)[0].trim();
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
