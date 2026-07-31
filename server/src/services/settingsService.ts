import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { sendHouseholdInviteEmail, sendTestEmail } from '../lib/email';
import { encrypt } from '../lib/encryption';
import { getAiClient, invalidateAiCache } from '../lib/ai';
import { assertSafeOutboundUrl } from '../lib/safeOutboundUrl';
import ExcelJS from 'exceljs';

// ─── Constants ────────────────────────────────────────────────────────────

export const DEFAULT_NOTIFICATION_PREFERENCES: Record<string, Record<string, boolean>> = {
  accountDisconnected: { inApp: true, email: true, push: false },
  largeExpense: { inApp: true, email: false, push: false },
  needsReview: { inApp: true, email: false, push: false },
  overBudget: { inApp: true, email: true, push: false },
  monthlyRecap: { inApp: true, email: true, push: false },
  newRecurring: { inApp: true, email: false, push: false },
  paymentDue: { inApp: true, email: true, push: false },
  goalMilestone: { inApp: true, email: true, push: false },
  weeklyDigest: { inApp: false, email: false, push: false },
};

const CATEGORY_BUCKETS = ['needs', 'wants', 'savings'] as const;

function isCategoryBucket(value: string | undefined): value is (typeof CATEGORY_BUCKETS)[number] {
  return value !== undefined && CATEGORY_BUCKETS.includes(value as (typeof CATEGORY_BUCKETS)[number]);
}

// ─── Profile ──────────────────────────────────────────────────────────────

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      avatar: true,
      timezone: true,
    },
  });
  if (!user) throw new Error('User not found');

  const member = await prisma.householdMember.findFirst({
    where: { userId },
    include: { household: { select: { currency: true } } },
  });

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatar ?? null,
    timezone: user.timezone ?? null,
    currency: member?.household.currency ?? 'USD',
  };
}

export async function updateProfile(
  userId: string,
  data: { firstName?: string; lastName?: string; timezone?: string }
) {
  const updateData: any = {};
  if (data.firstName !== undefined) updateData.firstName = data.firstName;
  if (data.lastName !== undefined) updateData.lastName = data.lastName;
  if (data.timezone !== undefined) updateData.timezone = data.timezone;

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      avatar: true,
      timezone: true,
    },
  });

  const member = await prisma.householdMember.findFirst({
    where: { userId },
    include: { household: { select: { currency: true } } },
  });

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatar ?? null,
    timezone: user.timezone ?? null,
    currency: member?.household.currency ?? 'USD',
  };
}

// ─── Household ────────────────────────────────────────────────────────────

export async function getHousehold(householdId: string) {
  const household = await prisma.household.findUnique({
    where: { id: householdId },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true, totpEnabled: true },
          },
        },
      },
    },
  });
  if (!household) throw new Error('Household not found');

  const members = household.members.map(m => ({
    userId: m.userId,
    firstName: m.user.firstName,
    lastName: m.user.lastName,
    email: m.user.email,
    role: m.role,
    joinedAt: m.joinedAt.toISOString(),
    totpEnabled: m.user.totpEnabled,
  }));

  return {
    id: household.id,
    name: household.name,
    currency: household.currency,
    members,
  };
}

export async function updateHousehold(
  householdId: string,
  userId: string,
  data: { name?: string; currency?: string }
) {
  const membership = await prisma.householdMember.findUnique({
    where: { userId_householdId: { userId, householdId } },
  });
  if (!membership || !['owner', 'admin'].includes(membership.role.toLowerCase())) {
    throw new Error('Only owners and admins can update household settings');
  }

  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.currency !== undefined) updateData.currency = data.currency;

  const household = await prisma.household.update({
    where: { id: householdId },
    data: updateData,
    include: {
      members: {
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true, totpEnabled: true },
          },
        },
      },
    },
  });

  const members = household.members.map(m => ({
    userId: m.userId,
    firstName: m.user.firstName,
    lastName: m.user.lastName,
    email: m.user.email,
    role: m.role,
    joinedAt: m.joinedAt.toISOString(),
    totpEnabled: m.user.totpEnabled,
  }));

  return {
    id: household.id,
    name: household.name,
    currency: household.currency,
    members,
  };
}

// ─── Household Members ─────────────────────────────────────────────────────

export async function inviteMember(
  householdId: string,
  userId: string,
  email: string,
  role: string = 'member'
) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedRole = String(role).trim().toLowerCase();
  if (!['member', 'admin'].includes(normalizedRole)) {
    throw new Error('role must be member or admin');
  }

  const membership = await prisma.householdMember.findUnique({
    where: { userId_householdId: { userId, householdId } },
  });
  if (!membership || !['owner', 'admin'].includes(membership.role.toLowerCase())) {
    throw new Error('Only owners and admins can invite members');
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const existingMember = await prisma.householdMember.findFirst({
    where: { householdId, user: { email: normalizedEmail } },
  });
  if (existingMember) {
    throw new Error('User is already a member of this household');
  }

  const invite = await prisma.householdInvite.create({
    data: {
      householdId,
      email: normalizedEmail,
      role: normalizedRole,
      expiresAt,
    },
    include: { household: { select: { name: true } } },
  });

  await sendHouseholdInviteEmail(normalizedEmail, invite.household.name, invite.token);

  return {
    success: true,
    message: 'Invitation sent',
    token: invite.token,
    inviteUrl: `/signup?invite=${encodeURIComponent(invite.token)}`,
    expiresAt: invite.expiresAt.toISOString(),
  };
}

export async function removeMember(
  householdId: string,
  userId: string,
  targetUserId: string
) {
  const membership = await prisma.householdMember.findUnique({
    where: { userId_householdId: { userId, householdId } },
  });
  if (!membership || membership.role.toLowerCase() !== 'owner') {
    throw new Error('Only the owner can remove members');
  }

  if (targetUserId === userId) {
    throw new Error('Owner cannot remove themselves from the household');
  }

  const targetMembership = await prisma.householdMember.findUnique({
    where: { userId_householdId: { userId: targetUserId, householdId } },
  });
  if (!targetMembership) {
    throw new Error('Member not found in this household');
  }

  await prisma.householdMember.delete({
    where: { userId_householdId: { userId: targetUserId, householdId } },
  });

  return { message: 'Member removed' };
}

export async function disableMember2fa(
  householdId: string,
  userId: string,
  targetUserId: string
) {
  const membership = await prisma.householdMember.findUnique({
    where: { userId_householdId: { userId, householdId } },
  });
  if (!membership || membership.role.toLowerCase() !== 'owner') {
    throw new Error('Only the owner can reset member 2FA');
  }

  if (targetUserId === userId) {
    throw new Error('Use your Security settings to disable your own 2FA');
  }

  const targetMembership = await prisma.householdMember.findUnique({
    where: { userId_householdId: { userId: targetUserId, householdId } },
  });
  if (!targetMembership) {
    throw new Error('Member not found in this household');
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: targetUserId },
      data: { totpSecret: null, totpEnabled: false, emailMfaEnabled: false, backupCodes: [] },
    });

    await tx.securityToken.deleteMany({
      where: { userId: targetUserId, type: 'email_otp', consumedAt: null },
    });

    await tx.refreshToken.deleteMany({
      where: { userId: targetUserId },
    });

    await tx.auditLog.create({
      data: {
        householdId,
        userId,
        action: 'MEMBER_MFA_RESET',
        entity: 'USER',
        entityId: targetUserId,
        changes: { after: { mfaReset: true, targetUserId, sessionsInvalidated: true } },
      },
    });
  });

  return { message: 'Member two-factor authentication disabled' };
}

// ─── Categories ───────────────────────────────────────────────────────────

export async function getCategories(householdId: string) {
  return prisma.category.findMany({
    where: { householdId },
    include: { group: { select: { id: true, name: true } } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function createCategory(
  householdId: string,
  data: { name: string; groupId?: string | null; icon?: string | null; type: string; bucketType?: string }
) {
  if (!data.name) throw new Error('name is required');
  if (!['income', 'expense', 'transfer'].includes(data.type)) {
    throw new Error('type must be income, expense, or transfer');
  }

  // Validate groupId belongs to household if provided
  if (data.groupId) {
    const group = await prisma.categoryGroup.findFirst({
      where: { id: data.groupId, householdId },
    });
    if (!group) {
      throw new Error('Category group not found in this household');
    }
  }

  return prisma.category.create({
    data: {
      householdId,
      name: data.name,
      groupId: data.groupId ?? null,
      icon: data.icon ?? null,
      type: data.type,
      bucketType: isCategoryBucket(data.bucketType) ? data.bucketType : 'wants',
    },
    include: { group: { select: { id: true, name: true } } },
  });
}

export async function updateCategory(
  householdId: string,
  categoryId: string,
  data: {
    name?: string;
    icon?: string;
    groupId?: string | null;
    isTaxDeductible?: boolean;
    excludeFromReports?: boolean;
    bucketType?: string;
    type?: string;
  }
) {
  const existing = await prisma.category.findFirst({
    where: { id: categoryId, householdId },
  });
  if (!existing) throw new Error('Category not found');

  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.icon !== undefined) updateData.icon = data.icon;
  if (data.groupId !== undefined) updateData.groupId = data.groupId;
  if (data.isTaxDeductible !== undefined) updateData.isTaxDeductible = data.isTaxDeductible;
  if (data.excludeFromReports !== undefined) updateData.excludeFromReports = data.excludeFromReports;
  if (data.bucketType !== undefined) {
    if (!isCategoryBucket(data.bucketType)) throw new Error('bucketType must be needs, wants, or savings');
    updateData.bucketType = data.bucketType;
  }
  if (data.type !== undefined) updateData.type = data.type;

  return prisma.category.update({
    where: { id: categoryId },
    data: updateData,
    include: { group: { select: { id: true, name: true } } },
  });
}

export async function deleteCategory(householdId: string, categoryId: string) {
  const existing = await prisma.category.findFirst({
    where: { id: categoryId, householdId },
  });
  if (!existing) throw new Error('Category not found');

  const txCount = await prisma.transactionJournal.count({
    where: { categoryId, householdId, isDeleted: false },
  });
  if (txCount > 0) {
    throw new Error(
      `Cannot delete category: it is used by ${txCount} transaction${txCount !== 1 ? 's' : ''}. Reassign them first.`
    );
  }

  await prisma.category.delete({ where: { id: categoryId } });
  return { success: true };
}

// ─── Category Groups ──────────────────────────────────────────────────────

export async function getCategoryGroups(householdId: string) {
  const groups = await prisma.categoryGroup.findMany({
    where: { householdId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { categories: true } } },
  });

  return groups.map(g => ({
    id: g.id,
    name: g.name,
    categoryCount: g._count.categories,
  }));
}

export async function createCategoryGroup(
  householdId: string,
  data: { name: string }
) {
  if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
    throw new Error('name is required');
  }

  const existing = await prisma.categoryGroup.findFirst({
    where: { householdId, name: data.name.trim() },
  });
  if (existing) {
    throw new Error('Group with this name already exists');
  }

  const group = await prisma.categoryGroup.create({
    data: {
      householdId,
      name: data.name.trim(),
    },
  });

  return { id: group.id, name: group.name, categoryCount: 0 };
}

export async function deleteCategoryGroup(householdId: string, groupId: string) {
  const existing = await prisma.categoryGroup.findFirst({
    where: { id: groupId, householdId },
    include: { _count: { select: { categories: true } } },
  });

  if (!existing) throw new Error('Group not found');

  if (existing._count.categories > 0) {
    throw new Error(
      `Cannot delete group: it contains ${existing._count.categories} categor${existing._count.categories !== 1 ? 'ies' : 'y'}. Move or delete them first.`
    );
  }

  await prisma.categoryGroup.delete({ where: { id: groupId } });
  return { success: true };
}

// ─── Tags ─────────────────────────────────────────────────────────────────

export async function getTags(householdId: string) {
  const tags = await prisma.tag.findMany({
    where: { householdId },
    include: { _count: { select: { transactionTags: true } } },
    orderBy: { name: 'asc' },
  });
  return tags.map(t => ({
    id: t.id,
    name: t.name,
    color: t.color,
    transactionCount: t._count.transactionTags,
  }));
}

export async function createTag(
  householdId: string,
  data: { name: string; color?: string }
) {
  if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
    throw new Error('name is required');
  }

  const tag = await prisma.tag.create({
    data: {
      householdId,
      name: data.name.trim(),
      color: data.color ?? '#6366f1',
    },
  });

  return { id: tag.id, name: tag.name, color: tag.color, transactionCount: 0 };
}

export async function updateTag(
  householdId: string,
  tagId: string,
  data: { name?: string; color?: string }
) {
  const existing = await prisma.tag.findFirst({ where: { id: tagId, householdId } });
  if (!existing) throw new Error('Tag not found');

  if (data.name !== undefined && (typeof data.name !== 'string' || !data.name.trim())) {
    throw new Error('name must be a non-empty string');
  }

  const updateData: { name?: string; color?: string } = {};
  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.color !== undefined) updateData.color = data.color;

  const tag = await prisma.tag.update({ where: { id: tagId }, data: updateData });

  const count = await prisma.transactionTag.count({ where: { tagId } });
  return { id: tag.id, name: tag.name, color: tag.color, transactionCount: count };
}

export async function deleteTag(householdId: string, tagId: string) {
  const existing = await prisma.tag.findFirst({ where: { id: tagId, householdId } });
  if (!existing) throw new Error('Tag not found');

  await prisma.tag.delete({ where: { id: tagId } });
  return { message: 'Tag deleted' };
}

// ─── Merchants ────────────────────────────────────────────────────────────

export async function getMerchants(householdId: string, order: 'NAME' | 'TRANSACTION_COUNT' = 'TRANSACTION_COUNT') {
  const merchants = await prisma.merchant.findMany({
    where: { householdId },
    select: {
      id: true,
      name: true,
      displayName: true,
      logoUrl: true,
      _count: { select: { journals: true } },
    },
    orderBy: order === 'NAME' ? { displayName: 'asc' } : { createdAt: 'asc' },
  });

  return merchants
    .map(m => ({
      id: m.id,
      name: m.name,
      displayName: m.displayName,
      logoUrl: m.logoUrl ?? null,
      transactionCount: m._count.journals,
    }))
    .sort((a, b) =>
      order === 'TRANSACTION_COUNT'
        ? b.transactionCount - a.transactionCount
        : a.displayName.localeCompare(b.displayName)
    );
}

export async function updateMerchant(
  householdId: string,
  merchantId: string,
  data: { displayName: string }
) {
  if (!data.displayName || typeof data.displayName !== 'string' || data.displayName.trim().length === 0) {
    throw new Error('displayName is required and must be non-empty');
  }
  if (data.displayName.trim().length > 100) {
    throw new Error('displayName must be 100 characters or fewer');
  }

  const existing = await prisma.merchant.findFirst({ where: { id: merchantId, householdId } });
  if (!existing) throw new Error('Merchant not found');

  const updated = await prisma.merchant.update({
    where: { id: merchantId },
    data: { displayName: data.displayName.trim() },
    select: { id: true, name: true, displayName: true, logoUrl: true },
  });

  return { ...updated, logoUrl: updated.logoUrl ?? null };
}

export async function deleteMerchant(householdId: string, merchantId: string) {
  const existing = await prisma.merchant.findFirst({ where: { id: merchantId, householdId } });
  if (!existing) throw new Error('Merchant not found');

  await prisma.transactionJournal.updateMany({
    where: { merchantId, householdId },
    data: { merchantId: null },
  });

  await prisma.merchant.delete({ where: { id: merchantId } });
  return { message: 'Merchant deleted' };
}

// ─── Notifications ────────────────────────────────────────────────────────

export async function getNotificationPrefs(userId: string) {
  const pref = await prisma.userPreference.findUnique({
    where: { userId_key: { userId, key: 'notification_preferences' } },
  });

  let preferences: Record<string, Record<string, boolean>>;
  if (pref) {
    try {
      preferences = JSON.parse(pref.value);
    } catch {
      preferences = DEFAULT_NOTIFICATION_PREFERENCES;
    }
  } else {
    preferences = DEFAULT_NOTIFICATION_PREFERENCES;
  }

  const thresholdPref = await prisma.userPreference.findUnique({
    where: { userId_key: { userId, key: 'low_balance_threshold' } },
  });
  const lowBalanceThreshold = thresholdPref ? parseFloat(thresholdPref.value) : null;
  return { preferences, lowBalanceThreshold };
}

export async function updateNotificationPrefs(
  userId: string,
  data: { preferences: Record<string, Record<string, boolean>>; lowBalanceThreshold?: number | null }
) {
  if (!data.preferences || typeof data.preferences !== 'object') {
    throw new Error('preferences must be an object');
  }

  await prisma.userPreference.upsert({
    where: { userId_key: { userId, key: 'notification_preferences' } },
    update: { value: JSON.stringify(data.preferences) },
    create: { userId, key: 'notification_preferences', value: JSON.stringify(data.preferences) },
  });

  if (data.lowBalanceThreshold !== undefined) {
    if (data.lowBalanceThreshold === null) {
      await prisma.userPreference.deleteMany({ where: { userId, key: 'low_balance_threshold' } });
    } else if (typeof data.lowBalanceThreshold === 'number' && data.lowBalanceThreshold >= 0) {
      await prisma.userPreference.upsert({
        where: { userId_key: { userId, key: 'low_balance_threshold' } },
        update: { value: String(data.lowBalanceThreshold) },
        create: { userId, key: 'low_balance_threshold', value: String(data.lowBalanceThreshold) },
      });
    }
  }
  return { preferences: data.preferences, lowBalanceThreshold: data.lowBalanceThreshold ?? null };
}

// ─── Security ─────────────────────────────────────────────────────────────

export async function updatePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
) {
  if (!currentPassword || !newPassword) {
    throw new Error('currentPassword and newPassword are required');
  }
  if (newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true },
  });
  if (!user) throw new Error('User not found');

  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValid) {
    throw new Error('Current password is incorrect');
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash },
  });

  return { success: true };
}

// ─── Dashboard Layout ─────────────────────────────────────────────────────

export async function getDashboardLayout(userId: string) {
  const pref = await prisma.userPreference.findUnique({
    where: { userId_key: { userId, key: 'dashboard_layout' } },
  });

  if (!pref) {
    return null;
  }

  try {
    return JSON.parse(pref.value);
  } catch {
    return null;
  }
}

export async function updateDashboardLayout(
  userId: string,
  layout: Array<{ id: string; visible: boolean; order: number }>
) {
  if (!Array.isArray(layout)) {
    throw new Error('layout must be an array');
  }

  for (const item of layout) {
    if (
      typeof item !== 'object' ||
      typeof item.id !== 'string' ||
      typeof item.visible !== 'boolean' ||
      typeof item.order !== 'number'
    ) {
      throw new Error('Each layout item must have id (string), visible (boolean), order (number)');
    }
  }

  await prisma.userPreference.upsert({
    where: { userId_key: { userId, key: 'dashboard_layout' } },
    update: { value: JSON.stringify(layout) },
    create: { userId, key: 'dashboard_layout', value: JSON.stringify(layout) },
  });

  return layout;
}

// ─── AI Config ────────────────────────────────────────────────────────────

export function formatAiConfigResponse(config: {
  provider: string;
  model: string;
  encryptedApiKey: string;
  baseUrl: string | null;
  headers?: string | null;
  updatedAt: Date;
} | null) {
  if (!config) {
    return { provider: 'none', model: '', baseUrl: null, headers: null, hasApiKey: false, updatedAt: null };
  }
  return {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    headers: config.headers ?? null,
    hasApiKey: config.encryptedApiKey !== '',
    updatedAt: config.updatedAt.toISOString(),
  };
}

export async function getAiConfig(householdId: string) {
  const config = await prisma.aiConfig.findUnique({ where: { householdId } });
  return formatAiConfigResponse(config);
}

export async function updateAiConfig(
  householdId: string,
  data: {
    provider: string;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    headers?: string;
  }
) {
  let safeBaseUrl = data.baseUrl?.trim() || null;

  if (safeBaseUrl && data.provider !== 'ollama') {
    try {
      safeBaseUrl = await assertSafeOutboundUrl(safeBaseUrl);
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Unsafe AI base URL');
    }
  }

  let encryptedApiKey: string | undefined;
  if (data.apiKey && data.apiKey.trim() !== '') {
    encryptedApiKey = encrypt(data.apiKey.trim());
  }

  const existing =
    encryptedApiKey === undefined
      ? await prisma.aiConfig.findUnique({ where: { householdId }, select: { encryptedApiKey: true } })
      : null;

  if (data.headers && data.headers.trim() !== '') {
    try {
      JSON.parse(data.headers);
    } catch {
      throw new Error('Headers must be valid JSON (e.g. {"Authorization": "Bearer sk-..."})');
    }
  }

  const config = await (prisma.aiConfig as any).upsert({
    where: { householdId },
    update: {
      provider: data.provider,
      model: data.model ?? '',
      ...(encryptedApiKey !== undefined ? { encryptedApiKey } : { encryptedApiKey: existing?.encryptedApiKey ?? '' }),
      baseUrl: safeBaseUrl,
      headers: data.headers?.trim() || null,
    },
    create: {
      householdId,
      provider: data.provider,
      model: data.model ?? '',
      encryptedApiKey: encryptedApiKey ?? '',
      baseUrl: safeBaseUrl,
      headers: data.headers?.trim() || null,
    },
  });

  invalidateAiCache(householdId);
  return formatAiConfigResponse(config);
}

export async function testAiConfig(householdId: string) {
  const config = await prisma.aiConfig.findUnique({ where: { householdId } });

  if (!config || config.provider === 'none') {
    return { valid: false, error: 'No provider configured' };
  }

  try {
    const client = getAiClient(config);
    const valid = await client.validateApiKey();
    return { valid };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Connection test failed';
    return { valid: false, error: message };
  }
}

// ─── Watch Tickers ────────────────────────────────────────────────────────

export async function getWatchTickers(userId: string) {
  const pref = await prisma.userPreference.findFirst({
    where: { userId, key: 'watch_tickers' },
  });
  return { tickers: pref?.value ?? '' };
}

export async function updateWatchTickers(userId: string, tickers: string) {
  if (typeof tickers !== 'string' || tickers.length > 500) {
    throw new Error('Invalid tickers');
  }
  await prisma.userPreference.upsert({
    where: { userId_key: { userId, key: 'watch_tickers' } },
    update: { value: tickers },
    create: { userId, key: 'watch_tickers', value: tickers },
  });
  return { tickers };
}

// ─── Account Management ───────────────────────────────────────────────────

export async function deleteAccount(userId: string, householdId: string, confirmPassword: string) {
  if (!confirmPassword) throw new Error('confirmPassword is required');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) throw new Error('User not found');

  const valid = await bcrypt.compare(confirmPassword, user.passwordHash);
  if (!valid) throw new Error('Incorrect password');

  const membership = await prisma.householdMember.findFirst({ where: { userId, householdId } });
  if (membership?.role === 'owner') {
    const memberCount = await prisma.householdMember.count({ where: { householdId } });
    if (memberCount > 1) {
      throw new Error('Transfer ownership or remove all other members before deleting your account');
    }
  }

  await prisma.refreshToken.deleteMany({ where: { userId } });
  await prisma.apiToken.deleteMany({ where: { userId } });

  if (membership?.role === 'owner') {
    await prisma.household.delete({ where: { id: householdId } });
  }

  await prisma.user.delete({ where: { id: userId } });
  return { message: 'Account deleted successfully' };
}

// ─── Data Export ──────────────────────────────────────────────────────────

export async function exportHouseholdData(householdId: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Kuber';
  workbook.created = new Date();

  // Accounts
  const accounts = await prisma.account.findMany({ where: { householdId }, orderBy: { name: 'asc' } });
  const accSheet = workbook.addWorksheet('Accounts');
  accSheet.columns = [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Type', key: 'type', width: 16 },
    { header: 'Institution', key: 'institution', width: 24 },
    { header: 'Balance', key: 'balance', width: 14 },
    { header: 'Currency', key: 'currency', width: 10 },
    { header: 'Credit Limit', key: 'creditLimit', width: 14 },
    { header: 'Hidden', key: 'isHidden', width: 10 },
  ];
  accounts.forEach(a =>
    accSheet.addRow({
      name: a.name,
      type: a.type,
      institution: a.institution ?? '',
      balance: a.balance,
      currency: a.currency,
      creditLimit: a.creditLimit ?? '',
      isHidden: a.isHidden,
    })
  );

  // Transactions
  const transactions = await prisma.transactionJournal.findMany({
    where: { householdId, isHidden: false },
    include: {
      category: { select: { name: true } },
      entries: { select: { account: { select: { name: true } } } },
      merchant: { select: { name: true } },
    },
    orderBy: { date: 'desc' },
  });
  const txSheet = workbook.addWorksheet('Transactions');
  txSheet.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Description', key: 'description', width: 36 },
    { header: 'Amount', key: 'amount', width: 14 },
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Account', key: 'account', width: 20 },
    { header: 'Merchant', key: 'merchant', width: 20 },
    { header: 'Notes', key: 'notes', width: 30 },
  ];
  transactions.forEach(t =>
    txSheet.addRow({
      date: t.date.toISOString().split('T')[0],
      description: t.description,
      amount: Number(t.amountDecimal),
      category: t.category?.name ?? '',
      account: t.entries[0]?.account?.name ?? '',
      merchant: t.merchant?.name ?? '',
      notes: t.notes ?? '',
    })
  );

  // Budgets
  const budgets = await prisma.budget.findMany({
    where: { householdId },
    include: { category: { select: { name: true } } },
  });
  const budgetSheet = workbook.addWorksheet('Budgets');
  budgetSheet.columns = [
    { header: 'Category', key: 'category', width: 24 },
    { header: 'Amount', key: 'amount', width: 14 },
    { header: 'Period', key: 'period', width: 14 },
    { header: 'Budget Type', key: 'budgetType', width: 14 },
  ];
  budgets.forEach(b =>
    budgetSheet.addRow({
      category: b.category?.name ?? b.name ?? '',
      amount: b.amount,
      period: b.period,
      budgetType: b.budgetType,
    })
  );

  // Goals
  const goals = await prisma.goal.findMany({ where: { householdId }, orderBy: { createdAt: 'asc' } });
  const goalsSheet = workbook.addWorksheet('Goals');
  goalsSheet.columns = [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Type', key: 'type', width: 14 },
    { header: 'Target Amount', key: 'targetAmount', width: 16 },
    { header: 'Current Amount', key: 'currentAmount', width: 16 },
    { header: 'Target Date', key: 'targetDate', width: 14 },
    { header: 'Monthly Contribution', key: 'monthlyContribution', width: 22 },
  ];
  goals.forEach(g =>
    goalsSheet.addRow({
      name: g.name,
      type: g.type,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
      targetDate: g.targetDate ? g.targetDate.toISOString().split('T')[0] : '',
      monthlyContribution: g.monthlyContribution,
    })
  );

  // Recurring
  const recurring = await prisma.recurringItem.findMany({
    where: { householdId },
    include: { category: { select: { name: true } }, account: { select: { name: true } } },
    orderBy: { nextDate: 'asc' },
  });
  const recurringSheet = workbook.addWorksheet('Recurring');
  recurringSheet.columns = [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Amount', key: 'amount', width: 14 },
    { header: 'Frequency', key: 'frequency', width: 14 },
    { header: 'Next Date', key: 'nextDate', width: 14 },
    { header: 'Account', key: 'account', width: 20 },
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Active', key: 'isActive', width: 10 },
  ];
  recurring.forEach(r =>
    recurringSheet.addRow({
      name: r.name,
      amount: r.amount,
      frequency: r.frequency,
      nextDate: r.nextDate.toISOString().split('T')[0],
      account: r.account?.name ?? '',
      category: r.category?.name ?? '',
      isActive: r.isActive,
    })
  );

  // Investments
  const investments = await prisma.investmentHolding.findMany({
    where: { account: { householdId }, isDeleted: false },
    orderBy: { symbol: 'asc' },
  });
  const investSheet = workbook.addWorksheet('Investments');
  investSheet.columns = [
    { header: 'Symbol', key: 'symbol', width: 12 },
    { header: 'Name', key: 'name', width: 28 },
    { header: 'Shares', key: 'shares', width: 12 },
    { header: 'Cost Basis', key: 'costBasis', width: 14 },
    { header: 'Current Price', key: 'currentPrice', width: 14 },
    { header: 'Asset Class', key: 'assetClass', width: 16 },
  ];
  investments.forEach(i =>
    investSheet.addRow({
      symbol: i.symbol,
      name: i.name,
      shares: i.shares,
      costBasis: i.costBasis,
      currentPrice: i.currentPrice,
      assetClass: i.assetClass,
    })
  );

  // Assets
  const assets = await prisma.manualAsset.findMany({ where: { householdId }, orderBy: { name: 'asc' } });
  const assetsSheet = workbook.addWorksheet('Assets');
  assetsSheet.columns = [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Type', key: 'assetType', width: 16 },
    { header: 'Current Value', key: 'currentValue', width: 16 },
    { header: 'Purchase Value', key: 'purchaseValue', width: 16 },
    { header: 'Currency', key: 'currency', width: 10 },
  ];
  assets.forEach(a =>
    assetsSheet.addRow({
      name: a.name,
      assetType: a.type,
      currentValue: a.currentValue,
      purchaseValue: a.purchaseValue ?? '',
      currency: a.currency,
    })
  );

  // Liabilities
  const liabilities = await prisma.manualLiability.findMany({
    where: { householdId },
    orderBy: { name: 'asc' },
  });
  const liabSheet = workbook.addWorksheet('Liabilities');
  liabSheet.columns = [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Type', key: 'type', width: 16 },
    { header: 'Current Balance', key: 'currentBalance', width: 16 },
    { header: 'Interest Rate', key: 'interestRate', width: 14 },
    { header: 'Monthly Payment', key: 'monthlyPayment', width: 16 },
    { header: 'Currency', key: 'currency', width: 10 },
  ];
  liabilities.forEach(l =>
    liabSheet.addRow({
      name: l.name,
      type: l.type,
      currentBalance: l.currentBalance,
      interestRate: l.interestRate ?? '',
      monthlyPayment: l.monthlyPayment ?? '',
      currency: l.currency,
    })
  );

  return workbook;
}

// ─── Email Config ─────────────────────────────────────────────────────────

export async function getEmailConfig() {
  const cfg = await prisma.emailConfig.findUnique({ where: { id: 'singleton' } });
  if (!cfg) {
    return {
      provider: 'none',
      resendFrom: '',
      smtpHost: '',
      smtpPort: 587,
      smtpUser: '',
      smtpFrom: '',
      hasResendKey: false,
      hasSmtpPass: false,
    };
  }
  return {
    provider: cfg.provider,
    resendFrom: cfg.resendFrom,
    smtpHost: cfg.smtpHost,
    smtpPort: cfg.smtpPort,
    smtpUser: cfg.smtpUser,
    smtpFrom: cfg.smtpFrom,
    hasResendKey: cfg.resendApiKey !== '',
    hasSmtpPass: cfg.smtpPass !== '',
  };
}

export async function updateEmailConfig(data: {
  provider: string;
  resendApiKey?: string;
  resendFrom?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
}) {
  const existing = await prisma.emailConfig.findUnique({ where: { id: 'singleton' } });

  const encryptedResendKey = data.resendApiKey?.trim() ? encrypt(data.resendApiKey.trim()) : existing?.resendApiKey ?? '';
  const encryptedSmtpPass = data.smtpPass?.trim() ? encrypt(data.smtpPass.trim()) : existing?.smtpPass ?? '';

  const cfg = await prisma.emailConfig.upsert({
    where: { id: 'singleton' },
    update: {
      provider: data.provider,
      resendApiKey: encryptedResendKey,
      resendFrom: data.resendFrom ?? existing?.resendFrom ?? '',
      smtpHost: data.smtpHost ?? existing?.smtpHost ?? '',
      smtpPort: data.smtpPort ?? existing?.smtpPort ?? 587,
      smtpUser: data.smtpUser ?? existing?.smtpUser ?? '',
      smtpPass: encryptedSmtpPass,
      smtpFrom: data.smtpFrom ?? existing?.smtpFrom ?? '',
    },
    create: {
      id: 'singleton',
      provider: data.provider,
      resendApiKey: encryptedResendKey,
      resendFrom: data.resendFrom ?? '',
      smtpHost: data.smtpHost ?? '',
      smtpPort: data.smtpPort ?? 587,
      smtpUser: data.smtpUser ?? '',
      smtpPass: encryptedSmtpPass,
      smtpFrom: data.smtpFrom ?? '',
    },
  });

  return {
    provider: cfg.provider,
    resendFrom: cfg.resendFrom,
    smtpHost: cfg.smtpHost,
    smtpPort: cfg.smtpPort,
    smtpUser: cfg.smtpUser,
    smtpFrom: cfg.smtpFrom,
    hasResendKey: cfg.resendApiKey !== '',
    hasSmtpPass: cfg.smtpPass !== '',
  };
}

export async function testEmailConfig(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user) throw new Error('User not found');
  await sendTestEmail(user.email);
  return { message: `Test email sent to ${user.email}` };
}
