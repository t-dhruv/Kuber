export interface TransactionRulePrefillInput {
  merchantName: string;
  categoryId?: string | null;
  categoryName?: string | null;
}

export interface TransactionRulePrefill {
  name: string;
  field: 'merchantName';
  operator: 'equals';
  value: string;
  categoryId?: string;
  categoryName?: string;
}

export function buildTransactionRulePrefill(
  transaction: TransactionRulePrefillInput,
): TransactionRulePrefill {
  const merchantName = transaction.merchantName.trim();
  const hasCategory = Boolean(transaction.categoryId && transaction.categoryName);

  return {
    name: hasCategory
      ? `${transaction.categoryName} (${merchantName})`
      : `Rule (${merchantName})`,
    field: 'merchantName',
    operator: 'equals',
    value: merchantName,
    ...(hasCategory
      ? {
          categoryId: transaction.categoryId ?? undefined,
          categoryName: transaction.categoryName ?? undefined,
        }
      : {}),
  };
}
