import { prisma } from './prisma';

interface CreateLinkInput {
  householdId: string;
  linkTypeId:  string;
  fromId:      string;
  toId:        string;
}

const LINK_INCLUDE = {
  linkType: { select: { name: true, inward: true, outward: true } },
  from:     { select: { id: true, description: true, amount: true, date: true } },
  to:       { select: { id: true, description: true, amount: true, date: true } },
} as const;

export async function listLinkTypes() {
  return prisma.transactionLinkType.findMany({ orderBy: { name: 'asc' } });
}

export async function createLink(input: CreateLinkInput) {
  if (input.fromId === input.toId) throw new Error('Cannot link a transaction to itself');

  const [fromTx, toTx] = await Promise.all([
    prisma.transaction.findFirst({ where: { id: input.fromId, householdId: input.householdId } }),
    prisma.transaction.findFirst({ where: { id: input.toId,   householdId: input.householdId } }),
  ]);
  if (!fromTx || !toTx) throw new Error('Transaction not found');

  return prisma.transactionLink.create({
    data:    { ...input },
    include: LINK_INCLUDE,
  });
}

export async function deleteLink(id: string, householdId: string) {
  const link = await prisma.transactionLink.findFirst({ where: { id, householdId } });
  if (!link) return null;
  await prisma.transactionLink.delete({ where: { id } });
  return link;
}

export async function getLinksForTransaction({
  householdId,
  transactionId,
}: {
  householdId:   string;
  transactionId: string;
}) {
  return prisma.transactionLink.findMany({
    where: {
      householdId,
      OR: [{ fromId: transactionId }, { toId: transactionId }],
    },
    include: LINK_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
}