import { prisma } from '../lib/prisma';
import { parseEncryptedField, type EncryptedField } from '../lib/encryptedField';

export async function getEncryptionStatus(householdId: string, userId: string) {
  const activeKey = await prisma.householdEncryptionKey.findFirst({
    where: { householdId, status: 'active' },
    orderBy: { version: 'desc' },
  });

  if (!activeKey) {
    return { enabled: false, activeKey: null, hasWrappedKey: false };
  }

  const wrapped = await prisma.householdWrappedKey.findFirst({
    where: { keyId: activeKey.id, userId },
  });

  return {
    enabled: true,
    activeKey: { id: activeKey.id, version: activeKey.version },
    hasWrappedKey: !!wrapped,
  };
}

export async function setupHouseholdEncryption(
  householdId: string,
  userId: string,
  wrappedKeyInput: unknown,
) {
  const wrappedKey: EncryptedField = parseEncryptedField(wrappedKeyInput)!;

  return prisma.$transaction(async (tx) => {
    const key = await tx.householdEncryptionKey.create({
      data: { householdId, version: 1, status: 'active' },
    });
    await tx.householdWrappedKey.create({
      data: { keyId: key.id, userId, wrappedKey },
    });
    return { enabled: true, activeKey: { id: key.id, version: key.version }, hasWrappedKey: true };
  });
}

export async function getWrappedHouseholdKey(householdId: string, userId: string) {
  const activeKey = await prisma.householdEncryptionKey.findFirst({
    where: { householdId, status: 'active' },
    orderBy: { version: 'desc' },
  });
  if (!activeKey) return null;

  const wrapped = await prisma.householdWrappedKey.findFirst({
    where: { keyId: activeKey.id, userId },
  });
  if (!wrapped) return null;

  return {
    keyId: activeKey.id,
    version: activeKey.version,
    wrappedKey: wrapped.wrappedKey,
  };
}
