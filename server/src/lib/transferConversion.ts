export interface LegacyTransferConversionTransaction {
  accountId: string;
  amount: number;
  description: string;
  originalDescription: string;
  date: Date;
  currencyCode?: string | null;
  notes?: string | null;
}

export interface PlanTransferConversionInput {
  existing: LegacyTransferConversionTransaction;
  fromAccountId: string;
  toAccountId: string;
  fromAccountName: string;
  toAccountName: string;
  transferId: string;
  amount?: number;
  date?: Date;
  notes?: string | null;
}

interface TransferLegPlan {
  accountId: string;
  amount: number;
  date: Date;
  description: string;
  originalDescription: string;
  currencyCode?: string | null;
  notes?: string | null;
  isTransfer: true;
  transferId: string;
  categoryId: null;
  merchantId: null;
  isSplit: false;
}

export interface TransferConversionPlan {
  amount: number;
  sourceDescription: string;
  destinationDescription: string;
  updatedExisting: TransferLegPlan;
  counterpart: TransferLegPlan;
}

export function planTransferConversion(input: PlanTransferConversionInput): TransferConversionPlan {
  if (input.fromAccountId === input.toAccountId) {
    throw new Error('Source and destination accounts must differ');
  }

  const amount = Math.abs(input.amount ?? input.existing.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Transaction amount must be greater than zero');
  }

  const date = input.date ?? input.existing.date;
  const notes = input.notes !== undefined ? input.notes : input.existing.notes ?? null;
  const sourceDescription = `Transfer to ${input.toAccountName}`;
  const destinationDescription = `Transfer from ${input.fromAccountName}`;

  const sourceLeg: TransferLegPlan = {
    accountId: input.fromAccountId,
    amount: -amount,
    date,
    description: sourceDescription,
    originalDescription: sourceDescription,
    currencyCode: input.existing.currencyCode ?? 'CAD',
    notes,
    isTransfer: true,
    transferId: input.transferId,
    categoryId: null,
    merchantId: null,
    isSplit: false,
  };

  const destinationLeg: TransferLegPlan = {
    accountId: input.toAccountId,
    amount,
    date,
    description: destinationDescription,
    originalDescription: destinationDescription,
    currencyCode: input.existing.currencyCode ?? 'CAD',
    notes,
    isTransfer: true,
    transferId: input.transferId,
    categoryId: null,
    merchantId: null,
    isSplit: false,
  };

  const existingIsDestination = input.existing.accountId === input.toAccountId && input.existing.amount > 0;

  return {
    amount,
    sourceDescription,
    destinationDescription,
    updatedExisting: existingIsDestination ? destinationLeg : sourceLeg,
    counterpart: existingIsDestination ? sourceLeg : destinationLeg,
  };
}
