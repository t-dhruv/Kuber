import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '../prisma';

type SnapshotSource = 'live' | 'snapshot';

export function chooseSnapshotSource(input: { isCurrentPeriod: boolean; snapshotExists: boolean }): SnapshotSource {
  return input.isCurrentPeriod || !input.snapshotExists ? 'live' : 'snapshot';
}

function toUtcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toNestedJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => toNestedJsonValue(item));
  }

  if (typeof value === 'object') {
    if ('toJSON' in value && typeof value.toJSON === 'function') {
      return toNestedJsonValue(value.toJSON());
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, toNestedJsonValue(item)]),
    );
  }

  return String(value);
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue | Prisma.JsonNullValueInput {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }

  const converted = toNestedJsonValue(value);
  return converted === null ? Prisma.JsonNull : converted;
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
  const reportingSnapshot: PrismaClient['reportingSnapshot'] = prisma.reportingSnapshot;
  const periodKey = `${snapshotDate.getUTCFullYear()}-${String(snapshotDate.getUTCMonth() + 1).padStart(2, '0')}`;
  const payload = toInputJsonValue(input.payload);

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
          payload,
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
          payload,
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
        payload,
        source: input.source,
        periodKey,
      },
      create: {
        householdId: input.householdId,
        kind: input.kind,
        snapshotDate,
        periodKey,
        subjectId: input.subjectId,
        payload,
        source: input.source,
      },
    });
  }
}

export async function listSnapshotDates(householdId: string, kind: string): Promise<Date[]> {
  const reportingSnapshot: PrismaClient['reportingSnapshot'] = prisma.reportingSnapshot;
  const snapshots = await reportingSnapshot.findMany({
    where: { householdId, kind },
    select: { snapshotDate: true },
    orderBy: { snapshotDate: 'asc' },
  });

  return snapshots.map((snapshot: { snapshotDate: Date }) => snapshot.snapshotDate);
}
