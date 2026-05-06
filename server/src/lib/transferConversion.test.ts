import { describe, expect, it } from 'vitest';
import { planTransferConversion } from './transferConversion';

describe('planTransferConversion', () => {
  it('keeps an existing expense as the source leg and creates the destination leg', () => {
    const plan = planTransferConversion({
      existing: {
        accountId: 'checking',
        amount: -125,
        description: 'Bank payment',
        originalDescription: 'Bank payment',
        date: new Date('2026-05-01T00:00:00.000Z'),
        currencyCode: 'CAD',
      },
      fromAccountId: 'checking',
      toAccountId: 'savings',
      fromAccountName: 'Checking',
      toAccountName: 'Savings',
      transferId: 'transfer-1',
    });

    expect(plan.updatedExisting).toMatchObject({
      accountId: 'checking',
      amount: -125,
      description: 'Transfer to Savings',
      isTransfer: true,
      transferId: 'transfer-1',
    });
    expect(plan.counterpart).toMatchObject({
      accountId: 'savings',
      amount: 125,
      description: 'Transfer from Checking',
      isTransfer: true,
      transferId: 'transfer-1',
    });
  });

  it('keeps an existing income as the destination leg and creates the source leg', () => {
    const plan = planTransferConversion({
      existing: {
        accountId: 'savings',
        amount: 200,
        description: 'Deposit',
        originalDescription: 'Deposit',
        date: new Date('2026-05-02T00:00:00.000Z'),
        currencyCode: 'CAD',
      },
      fromAccountId: 'checking',
      toAccountId: 'savings',
      fromAccountName: 'Checking',
      toAccountName: 'Savings',
      transferId: 'transfer-2',
    });

    expect(plan.updatedExisting).toMatchObject({
      accountId: 'savings',
      amount: 200,
      description: 'Transfer from Checking',
    });
    expect(plan.counterpart).toMatchObject({
      accountId: 'checking',
      amount: -200,
      description: 'Transfer to Savings',
    });
  });

  it('rejects transfers between the same account', () => {
    expect(() =>
      planTransferConversion({
        existing: {
          accountId: 'checking',
          amount: -20,
          description: 'Move',
          originalDescription: 'Move',
          date: new Date('2026-05-03T00:00:00.000Z'),
          currencyCode: 'CAD',
        },
        fromAccountId: 'checking',
        toAccountId: 'checking',
        fromAccountName: 'Checking',
        toAccountName: 'Checking',
        transferId: 'transfer-3',
      }),
    ).toThrow('Source and destination accounts must differ');
  });
});
