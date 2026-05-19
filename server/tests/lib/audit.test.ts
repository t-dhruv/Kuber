import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logAudit } from '../../src/lib/audit';
import { prismaMock } from '../../src/test-setup';

vi.mock('../../src/lib/logger.js', () => ({
  createModuleLogger: vi.fn(() => ({
    error: vi.fn(),
  })),
}));

describe('logAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes an audit log with before and after snapshots', () => {
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    logAudit({
      householdId: 'household-1',
      userId: 'user-1',
      action: 'UPDATE',
      entity: 'TRANSACTION',
      entityId: 'transaction-1',
      before: { amount: 10 },
      after: { amount: 15 },
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        householdId: 'household-1',
        userId: 'user-1',
        action: 'UPDATE',
        entity: 'TRANSACTION',
        entityId: 'transaction-1',
        changes: {
          before: { amount: 10 },
          after: { amount: 15 },
        },
      },
    });
  });

  it('omits changes when no snapshots are provided', () => {
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    logAudit({
      householdId: 'household-1',
      userId: 'user-1',
      action: 'DELETE',
      entity: 'GOAL',
      entityId: 'goal-1',
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        householdId: 'household-1',
        userId: 'user-1',
        action: 'DELETE',
        entity: 'GOAL',
        entityId: 'goal-1',
        changes: undefined,
      },
    });
  });

  it('does not throw when the asynchronous write fails', () => {
    prismaMock.auditLog.create.mockRejectedValue(new Error('database unavailable') as never);

    expect(() =>
      logAudit({
        householdId: 'household-1',
        userId: 'user-1',
        action: 'CREATE',
        entity: 'BUDGET',
        entityId: 'budget-1',
      }),
    ).not.toThrow();
  });
});


