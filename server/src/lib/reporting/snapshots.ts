import { prisma } from '../prisma';

type SnapshotSource = 'live' | 'snapshot';

export function chooseSnapshotSource(input: { isCurrentPeriod: boolean; snapshotExists: boolean }): SnapshotSource {
  return input.isCurrentPeriod || !input.snapshotExists ? 'live' : 'snapshot';
}

function toUtcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function upsertDailySnapshot(input: {
  householdId: string;
  kind: string;
  date: Date;
  payload: unknown;
  source: string;
  subjectId?: string | null;
}): Promise<void> {
  const snapshotDate = toUtcDateOnly(input.date);
  const reportingSnapshot = (prisma as any).reportingSnapshot;
  const periodKey = `${snapshotDate.getUTCFullYear()}-${String(snapshotDate.getUTCMonth() + 1).padStart(2, '0')}`;

  // Prisma upsert doesn't accept null in where clause for compound unique constraints.
  // Handle null subjectId with findFirst + create/update instead.
  if (input.subjectId == null) {
    const existing = await reportingSnapshot.findFirst({
      where: {
        householdId: input.householdId,
        kind: input.kind,
        snapshotDate,
        subjectId: null,
      },
      select: { id: true },
    });

    if (existing) {
      await reportingSnapshot.update({
        where: { id: existing.id },
        data: {
          payload: input.payload as never,
          source: input.source,
          periodKey,
        },
      });
    } else {
      await reportingSnapshot.create({
        data: {
          householdId: input.householdId,
          kind: input.kind,
          snapshotDate,
          periodKey,
          subjectId: null,
          payload: input.payload as never,
          source: input.source,
        },
      });
    }
  } else {
    await reportingSnapshot.upsert({
      where: {
        householdId_kind_snapshotDate_subjectId: {
          householdId: input.householdId,
          kind: input.kind,
          snapshotDate,
          subjectId: input.subjectId,
        },
      },
      update: {
        payload: input.payload as never,
        source: input.source,
        periodKey,
      },
      create: {
        householdId: input.householdId,
        kind: input.kind,
        snapshotDate,
        periodKey,
        subjectId: input.subjectId,
        payload: input.payload as never,
        source: input.source,
      },
    });
  }
}

export async function listSnapshotDates(householdId: string, kind: string): Promise<Date[]> {
  const reportingSnapshot = (prisma as any).reportingSnapshot;
  const snapshots = await reportingSnapshot.findMany({
    where: { householdId, kind },
    select: { snapshotDate: true },
    orderBy: { snapshotDate: 'asc' },
  });

  return snapshots.map((snapshot: { snapshotDate: Date }) => snapshot.snapshotDate);
}
