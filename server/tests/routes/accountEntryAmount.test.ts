import { describe, expect, it } from 'vitest';
import { getAccountEntryAmount } from '../../src/routeModules/accounts';

describe('getAccountEntryAmount', () => {
  it('uses the selected account entry amount instead of the journal total', () => {
    const journal = {
      amountDecimal: 250,
      entries: [
        { accountId: 'checking', amountDecimal: -250 },
        { accountId: 'credit-card', amountDecimal: 250 },
      ],
    };

    expect(getAccountEntryAmount(journal, 'checking')).toBe(-250);
    expect(getAccountEntryAmount(journal, 'credit-card')).toBe(250);
  });
});
