import { describe, expect, it } from 'vitest';
import { NOT_DELETED, addNotDeletedFilter, addNotDeletedToAnd } from '../../src/lib/softDeleteWhere';

describe('soft delete where helpers', () => {
  it('exports the standard not-deleted predicate', () => {
    expect(NOT_DELETED).toEqual({ isDeleted: false });
  });

  it('adds isDeleted false to a flat where clause without mutating the input', () => {
    const where = { householdId: 'household-1', isDeleted: true };

    expect(addNotDeletedFilter(where)).toEqual({
      householdId: 'household-1',
      isDeleted: false,
    });
    expect(where).toEqual({ householdId: 'household-1', isDeleted: true });
  });

  it('adds isDeleted false to a where clause with no AND expression', () => {
    expect(addNotDeletedToAnd({ householdId: 'household-1' })).toEqual({
      householdId: 'household-1',
      isDeleted: false,
    });
  });

  it('appends not-deleted predicate to an existing AND array', () => {
    expect(addNotDeletedToAnd({ AND: [{ householdId: 'household-1' }] })).toEqual({
      AND: [{ householdId: 'household-1' }, NOT_DELETED],
    });
  });

  it('wraps a single existing AND predicate before appending not-deleted predicate', () => {
    expect(addNotDeletedToAnd({ AND: { householdId: 'household-1' } })).toEqual({
      AND: [{ householdId: 'household-1' }, NOT_DELETED],
    });
  });
});

