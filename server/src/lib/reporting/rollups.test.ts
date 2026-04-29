import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockReportingRollupUpsert, mockReportingRollupFindFirst, mockReportingRollupUpdate, mockReportingRollupCreate } = vi.hoisted(() => ({
  mockReportingRollupUpsert: vi.fn(),
  mockReportingRollupFindFirst: vi.fn(),
  mockReportingRollupUpdate: vi.fn(),
  mockReportingRollupCreate: vi.fn(),
}));

vi.mock('../prisma', () => ({
  prisma: {
    reportingRollup: {
      upsert: mockReportingRollupUpsert,
      findFirst: mockReportingRollupFindFirst,
      update: mockReportingRollupUpdate,
      create: mockReportingRollupCreate,
    },
  },
}));

import { buildMonthlyRollupKey, upsertMonthlyRollup } from './rollups';

describe('reporting rollups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a canonical YYYY-MM rollup key', () => {
    expect(buildMonthlyRollupKey(new Date('2026-04-29T12:00:00Z'))).toBe('2026-04');
  });

  it('writes a monthly rollup with null subjectId using findFirst+create', async () => {
    mockReportingRollupFindFirst.mockResolvedValue(null);
    mockReportingRollupCreate.mockResolvedValue({});

    await upsertMonthlyRollup({
      householdId: 'household-1',
      kind: 'net_worth',
      periodKey: '2026-04',
      payload: { total: 123 },
      source: 'daily_snapshots',
    });

    expect(mockReportingRollupFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ householdId: 'household-1', kind: 'net_worth', periodKey: '2026-04', subjectId: null }),
      }),
    );
    expect(mockReportingRollupCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          householdId: 'household-1',
          periodKey: '2026-04',
          kind: 'net_worth',
          subjectId: null,
          payload: { total: 123 },
          source: 'daily_snapshots',
        }),
      }),
    );
  });

  it('updates existing rollup with null subjectId via findFirst+update', async () => {
    mockReportingRollupFindFirst.mockResolvedValue({ id: 'existing-id' });
    mockReportingRollupUpdate.mockResolvedValue({});

    await upsertMonthlyRollup({
      householdId: 'household-1',
      kind: 'net_worth',
      periodKey: '2026-04',
      payload: { total: 456 },
      source: 'daily_snapshots',
    });

    expect(mockReportingRollupUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'existing-id' },
        data: expect.objectContaining({ payload: { total: 456 }, source: 'daily_snapshots' }),
      }),
    );
  });

  it('uses upsert when subjectId is provided', async () => {
    mockReportingRollupUpsert.mockResolvedValue({});

    await upsertMonthlyRollup({
      householdId: 'household-1',
      kind: 'net_worth',
      periodKey: '2026-04',
      subjectId: 'sub-1',
      payload: { total: 789 },
      source: 'daily_snapshots',
    });

    expect(mockReportingRollupUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          householdId_kind_periodKey_subjectId: {
            householdId: 'household-1',
            kind: 'net_worth',
            periodKey: '2026-04',
            subjectId: 'sub-1',
          },
        },
      }),
    );
  });
});
