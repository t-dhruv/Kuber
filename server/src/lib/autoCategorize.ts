/**
 * autoCategorize.ts
 * AI-powered transaction categorization.
 * Uses the household's configured AI provider (same as advisor).
 * Gracefully returns null if no provider configured.
 */
import { PrismaClient } from '@prisma/client';
import { getAiClientForHousehold } from './ai/index.js';

export interface CategorySuggestion {
  categoryId: string;
  categoryName: string;
  confidence: number; // 0-1
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
  // Get categories for this household
  const categories = await prisma.category.findMany({
    where: { householdId },
    select: { id: true, name: true, type: true },
  });

  if (categories.length === 0) return null;

  let client;
  try {
    client = await getAiClientForHousehold(householdId, prisma);
  } catch {
    return null; // AI not configured
  }

  const categoryList = categories.map((c) => `${c.name} (${c.type})`).join(', ');
  const txnType = amount < 0 ? 'expense' : 'income';

  const prompt = `You are a transaction categorizer. Given a ${txnType} transaction description, pick the BEST matching category from the list below. Respond with ONLY a JSON object: {"category": "CategoryName", "confidence": 0.0-1.0}

Categories: ${categoryList}

Transaction: "${description}" (${txnType}, $${Math.abs(amount).toFixed(2)})`;

  try {
    const result = await client.complete({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 60,
      temperature: 0.1,
    });

    const json = JSON.parse(result.content.match(/\{.*\}/s)?.[0] ?? '{}');
    const matchedName = json.category as string;
    const confidence = parseFloat(json.confidence) || 0;

    if (!matchedName || confidence < 0.5) return null;

    const matched = categories.find(
      (c) => c.name.toLowerCase() === matchedName.toLowerCase()
    );
    if (!matched) return null;

    return { categoryId: matched.id, categoryName: matched.name, confidence };
  } catch {
    return null;
  }
}

/**
 * Batch auto-categorize uncategorized transactions for a household.
 * Returns count of transactions updated.
 */
export async function batchAutoCategorize(
  prisma: PrismaClient,
  householdId: string,
  limit = 50
): Promise<{ updated: number; skipped: number; notConfigured: boolean }> {
  // Check AI is configured first
  let client;
  try {
    client = await getAiClientForHousehold(householdId, prisma);
    void client; // just checking
  } catch {
    return { updated: 0, skipped: 0, notConfigured: true };
  }

  const uncategorized = await prisma.transaction.findMany({
    where: { householdId, categoryId: null, isHidden: false },
    orderBy: { date: 'desc' },
    take: limit,
    select: { id: true, description: true, amount: true },
  });

  let updated = 0;
  let skipped = 0;

  for (const txn of uncategorized) {
    const suggestion = await suggestCategory(prisma, householdId, txn.description, txn.amount);
    if (suggestion && suggestion.confidence >= 0.6) {
      await prisma.transaction.update({
        where: { id: txn.id },
        data: { categoryId: suggestion.categoryId, needsReview: false },
      });
      updated++;
    } else {
      skipped++;
    }
  }

  return { updated, skipped, notConfigured: false };
}
