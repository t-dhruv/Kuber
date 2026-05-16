import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockReportingSnapshotUpsert, mockReportingSnapshotFindFirst, mockReportingSnapshotUpdate, mockReportingSnapshotCreate, mockReportingSnapshotFindMany, mockReportingRollupUpsert } = vi.hoisted(() => ({
  mockReportingSnapshotUpsert: vi.fn(),
  mockReportingSnapshotFindFirst: vi.fn(),
  mockReportingSnapshotUpdate: vi.fn(),
  mockReportingSnapshotCreate: vi.fn(),
  mockReportingSnapshotFindMany: vi.fn(),
  mockReportingRollupUpsert: vi.fn(),
}));

vi.mock('../prisma', () => ({
  prisma: {
    household: { findMany: vi.fn() },
    account: { findMany: vi.fn() },
    reportingSnapshot: {
      upsert: mockReportingSnapshotUpsert,
      findFirst: mockReportingSnapshotFindFirst,
      update: mockReportingSnapshotUpdate,
      create: mockReportingSnapshotCreate,
      findMany: mockReportingSnapshotFindMany,
    },
    reportingRollup: {
      upsert: mockReportingRollupUpsert,
    },
    netWorthSnapshot: { upsert: vi.fn() },
    accountBalanceSnapshot: { upsert: vi.fn() },
  },
}));

import { chooseSnapshotSource, listSnapshotDates, upsertDailySnapshot } from './snapshots';

describe('reporting snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('chooses live data for current-period reporting and snapshots for historical reporting', () => {
    expect(chooseSnapshotSource({ isCurrentPeriod: true, snapshotExists: true })).toBe('live');
    expect(chooseSnapshotSource({ isCurrentPeriod: false, snapshotExists: true })).toBe('snapshot');
    expect(chooseSnapshotSource({ isCurrentPeriod: false, snapshotExists: false })).toBe('live');
  });

  it('creates a reporting snapshot with null subjectId via findFirst+create', async () => {
    mockReportingSnapshotFindFirst.mockResolvedValue(null);
    mockReportingSnapshotCreate.mockResolvedValue({});

    await upsertDailySnapshot({
      householdId: 'household-1',
      kind: 'net_worth',
      date: new Date('2026-04-29T16:00:00Z'),
      payload: { netWorth: 1000 },
      source: 'live',
    });

    expect(mockReportingSnapshotFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          householdId: 'household-1',
          kind: 'net_worth',
          snapshotDate: new Date('2026-04-29T00:00:00.000Z'),
          subjectId: null,
        }),
      }),
    );
    expect(mockReportingSnapshotCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          householdId: 'household-1',
          kind: 'net_worth',
          snapshotDate: new Date('2026-04-29T00:00:00.000Z'),
          periodKey: '2026-04',
          subjectId: null,
          source: 'live',
          payload: { netWorth: 1000 },
        }),
      }),
    );
  });

  it('updates existing snapshot with null subjectId via findFirst+update', async () => {
    mockReportingSnapshotFindFirst.mockResolvedValue({ id: 'existing-id' });
    mockReportingSnapshotUpdate.mockResolvedValue({});

    await upsertDailySnapshot({
      householdId: 'household-1',
      kind: 'net_worth',
      date: new Date('2026-04-29T16:00:00Z'),
      payload: { netWorth: 2000 },
      source: 'live',
    });

    expect(mockReportingSnapshotUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'existing-id' },
        data: expect.objectContaining({ payload: { netWorth: 2000 }, source: 'live' }),
      }),
    );
  });

  it('uses upsert when subjectId is provided', async () => {
    mockReportingSnapshotUpsert.mockResolvedValue({});

    await upsertDailySnapshot({
      householdId: 'household-1',
      kind: 'net_worth',
      date: new Date('2026-04-29T16:00:00Z'),
      subjectId: 'sub-1',
      payload: { netWorth: 3000 },
      source: 'live',
    });

    expect(mockReportingSnapshotUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          householdId_kind_snapshotDate_subjectId: {
            householdId: 'household-1',
            kind: 'net_worth',
            snapshotDate: new Date('2026-04-29T00:00:00.000Z'),
            subjectId: 'sub-1',
          },
        },
      }),
    );
  });

  it('lists snapshot dates for a household and kind', async () => {
    mockReportingSnapshotFindMany.mockResolvedValue([{ snapshotDate: new Date('2026-04-01T00:00:00Z') }]);

    await listSnapshotDates('household-1', 'net_worth');

    expect(mockReportingSnapshotFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { householdId: 'household-1', kind: 'net_worth' },
      }),
    );
  });
});
