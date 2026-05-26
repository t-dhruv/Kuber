import type { ReviewTransaction } from './components/ReviewTransactionRow';

export interface TransactionRulePrefill {
  name: string;
  field: 'description';
  operator: 'startsWith';
  value: string;
  categoryId?: string;
  categoryName?: string;
}

function getRulePattern(description: string): string {
  return description.toLowerCase().split(/[\s_-]/)[0]?.trim() || description.toLowerCase().trim();
}

export function buildTransactionRulePrefill(
  transaction: Pick<
    ReviewTransaction,
    'description' | 'aiSuggestedCategoryId' | 'aiSuggestedCategoryName'
  >,
): TransactionRulePrefill {
  const value = getRulePattern(transaction.description);
  const hasCategory = Boolean(transaction.aiSuggestedCategoryId && transaction.aiSuggestedCategoryName);

  return {
    name: hasCategory
      ? `${transaction.aiSuggestedCategoryName} (${value}*)`
      : `Rule (${value}*)`,
    field: 'description',
    operator: 'startsWith',
    value,
    ...(hasCategory
      ? {
          categoryId: transaction.aiSuggestedCategoryId ?? undefined,
          categoryName: transaction.aiSuggestedCategoryName ?? undefined,
        }
      : {}),
  };
}
