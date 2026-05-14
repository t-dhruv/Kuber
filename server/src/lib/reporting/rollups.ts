import { prisma } from '../prisma';

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
  const reportingRollup = (prisma as any).reportingRollup;

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
          payload: input.payload as never,
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
          payload: input.payload as never,
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
        payload: input.payload as never,
        source: input.source,
      },
      create: {
        householdId: input.householdId,
        kind: input.kind,
        periodKey: input.periodKey,
        subjectId: input.subjectId,
        payload: input.payload as never,
        source: input.source,
      },
    });
  }
}
