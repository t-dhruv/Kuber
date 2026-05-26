import { describe, expect, it } from 'vitest';
import { ruleMatches } from '../src/lib/ruleEngine';

describe('ruleMatches', () => {
  it('matches any condition when strict mode is disabled', () => {
    const conditions = [
      { field: 'description', operator: 'contains', value: 'grocery' },
      { field: 'amount', operator: 'gt', value: 100 },
    ] as const;

    const result = ruleMatches(
      conditions,
      { description: 'Grocery store', amount: 12 },
      false,
    );

    expect(result).toBe(true);
  });

  it('requires every condition by default', () => {
    const conditions = [
      { field: 'description', operator: 'contains', value: 'grocery' },
      { field: 'amount', operator: 'gt', value: 100 },
    ] as const;

    expect(ruleMatches(conditions, { description: 'Grocery store', amount: 12 })).toBe(false);
  });
});
