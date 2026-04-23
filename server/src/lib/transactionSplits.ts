import { Prisma } from '@prisma/client';

export type SplitInput = {
  categoryId: string;
  amount: number;
  note?: string | null;
};

type SplitCategory = {
  id: string;
  name: string;
};

type DbSplit = {
  id: string;
  categoryId: string | null;
  amountDecimal?: Prisma.Decimal | null;
  notes?: string | null;
  category?: SplitCategory | null;
};

export type SplitResponse = {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  amount: number;
  note?: string;
  notes?: string | null;
};

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function buildSplitCreateManyData(splits: SplitInput[]) {
  return splits.map((split) => ({
    amountDecimal: new Prisma.Decimal(split.amount).toDecimalPlaces(4),
    categoryId: split.categoryId,
    notes: split.note?.trim() ? split.note.trim() : null,
  }));
}

export function mapDbSplitsToLegacyDetails(splits: DbSplit[]): SplitResponse[] {
  return splits.map((split) => ({
    id: split.id,
    categoryId: split.categoryId ?? null,
    categoryName: split.category?.name ?? null,
    amount: roundMoney(Number(split.amountDecimal ?? 0)),
    note: split.notes ?? undefined,
    notes: split.notes ?? null,
  }));
}

export function normalizeLegacySplitDetails(raw: unknown): SplitResponse[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((split: any, index) => ({
    id: typeof split?.id === 'string' ? split.id : `legacy-${index}`,
    categoryId: typeof split?.categoryId === 'string' ? split.categoryId : null,
    categoryName: typeof split?.categoryName === 'string' ? split.categoryName : null,
    amount: roundMoney(typeof split?.amount === 'number' ? split.amount : 0),
    note: typeof split?.note === 'string' ? split.note : typeof split?.notes === 'string' ? split.notes : undefined,
    notes: typeof split?.notes === 'string' ? split.notes : typeof split?.note === 'string' ? split.note : null,
  }));
}

export function getTransactionSplitDetails(tx: { splits?: DbSplit[]; splitDetails?: unknown }): SplitResponse[] {
  if (Array.isArray(tx.splits) && tx.splits.length > 0) {
    return mapDbSplitsToLegacyDetails(tx.splits);
  }
  return normalizeLegacySplitDetails(tx.splitDetails);
}
