import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '../prisma';

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

export function buildMonthlyRollupKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function upsertMonthlyRollup(input: {
  householdId: string;
  kind: string;
  periodKey: string;
  payload: unknown;
  source: string;
  subjectId?: string | null;
}): Promise<void> {
  const reportingRollup: PrismaClient['reportingRollup'] = prisma.reportingRollup;
  const payload = toInputJsonValue(input.payload);

  // Prisma upsert doesn't accept null in where clause for compound unique constraints.
  // Handle null subjectId with findFirst + create/update instead.
  if (input.subjectId == null) {
    const existing = await reportingRollup.findFirst({
      where: {
        householdId: input.householdId,
        kind: input.kind,
        periodKey: input.periodKey,
        subjectId: null,
      },
      select: { id: true },
    });

    if (existing) {
      await reportingRollup.update({
        where: { id: existing.id },
        data: {
          payload,
          source: input.source,
        },
      });
    } else {
      await reportingRollup.create({
        data: {
          householdId: input.householdId,
          kind: input.kind,
          periodKey: input.periodKey,
          subjectId: null,
          payload,
          source: input.source,
        },
      });
    }
  } else {
    await reportingRollup.upsert({
      where: {
        householdId_kind_periodKey_subjectId: {
          householdId: input.householdId,
          kind: input.kind,
          periodKey: input.periodKey,
          subjectId: input.subjectId,
        },
      },
      update: {
        payload,
        source: input.source,
      },
      create: {
        householdId: input.householdId,
        kind: input.kind,
        periodKey: input.periodKey,
        subjectId: input.subjectId,
        payload,
        source: input.source,
      },
    });
  }
}
