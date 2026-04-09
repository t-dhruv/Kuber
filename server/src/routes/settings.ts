import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { sendTestEmail } from '../lib/email';
import { encrypt } from '../lib/encryption';
import { getAiClient, invalidateAiCache } from '../lib/ai';
import ExcelJS from 'exceljs';

const router = Router();

const DEFAULT_NOTIFICATION_PREFERENCES: Record<string, Record<string, boolean>> = {
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

// GET /api/v1/settings/profile
router.get('/profile', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

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
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Derive currency from household
    const member = await prisma.householdMember.findFirst({
      where: { userId },
      include: { household: { select: { currency: true } } },
    });

    return res.json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatar ?? null,
      timezone: user.timezone ?? null,
      currency: member?.household.currency ?? 'USD',
    });
  } catch (err) {
    console.error('[settings/profile GET]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/settings/profile
router.put('/profile', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { firstName, lastName, timezone } = req.body;

    const updateData: any = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (timezone !== undefined) updateData.timezone = timezone;

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

    return res.json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatar ?? null,
      timezone: user.timezone ?? null,
      currency: member?.household.currency ?? 'USD',
    });
  } catch (err) {
    console.error('[settings/profile PUT]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/settings/household
router.get('/household', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    const household = await prisma.household.findUnique({
      where: { id: householdId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });
    if (!household) return res.status(404).json({ error: 'Household not found' });

    const members = household.members.map(m => ({
      userId: m.userId,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      email: m.user.email,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
    }));

    return res.json({
      id: household.id,
      name: household.name,
      currency: household.currency,
      members,
    });
  } catch (err) {
    console.error('[settings/household GET]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/settings/household
router.put('/household', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const userId = req.userId!;
    const { name, currency } = req.body;

    // Require Owner or Admin role
    const membership = await prisma.householdMember.findUnique({
      where: { userId_householdId: { userId, householdId } },
    });
    if (!membership || !['owner', 'admin'].includes(membership.role.toLowerCase())) {
      return res.status(403).json({ error: 'Only owners and admins can update household settings' });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (currency !== undefined) updateData.currency = currency;

    const household = await prisma.household.update({
      where: { id: householdId },
      data: updateData,
      include: {
        members: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
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
    }));

    return res.json({
      id: household.id,
      name: household.name,
      currency: household.currency,
      members,
    });
  } catch (err) {
    console.error('[settings/household PUT]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/settings/household/invite
router.post('/household/invite', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const userId = req.userId!;
    const { email, role = 'member' } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    // Require Owner or Admin
    const membership = await prisma.householdMember.findUnique({
      where: { userId_householdId: { userId, householdId } },
    });
    if (!membership || !['owner', 'admin'].includes(membership.role.toLowerCase())) {
      return res.status(403).json({ error: 'Only owners and admins can invite members' });
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await prisma.householdInvite.create({
      data: {
        householdId,
        email,
        role,
        expiresAt,
      },
    });

    return res.json({
      success: true,
      message: 'Invitation sent (email not implemented in dev)',
    });
  } catch (err) {
    console.error('[settings/household/invite POST]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/settings/household/members/:id
router.delete('/household/members/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const userId = req.userId!;
    const { id: targetUserId } = req.params;

    // Verify requesting user is the household owner
    const membership = await prisma.householdMember.findUnique({
      where: { userId_householdId: { userId, householdId } },
    });
    if (!membership || membership.role.toLowerCase() !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can remove members' });
    }

    // Prevent owner from removing themselves
    if (targetUserId === userId) {
      return res.status(400).json({ error: 'Owner cannot remove themselves from the household' });
    }

    // Verify target member belongs to this household
    const targetMembership = await prisma.householdMember.findUnique({
      where: { userId_householdId: { userId: targetUserId, householdId } },
    });
    if (!targetMembership) {
      return res.status(404).json({ error: 'Member not found in this household' });
    }

    await prisma.householdMember.delete({
      where: { userId_householdId: { userId: targetUserId, householdId } },
    });

    return res.json({ message: 'Member removed' });
  } catch (err) {
    console.error('[settings/household/members DELETE]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/settings/categories
router.get('/categories', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    const categories = await prisma.category.findMany({
      where: { householdId },
      include: { group: { select: { id: true, name: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return res.json(categories);
  } catch (err) {
    console.error('[settings/categories GET]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/settings/categories
router.post('/categories', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { name, groupId, emoji, type = 'expense' } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    // Validate groupId belongs to household if provided
    if (groupId) {
      const group = await prisma.categoryGroup.findFirst({
        where: { id: groupId, householdId },
      });
      if (!group) {
        return res.status(400).json({ error: 'Category group not found in this household' });
      }
    }

    const category = await prisma.category.create({
      data: {
        householdId,
        name,
        groupId: groupId ?? null,
        emoji: emoji ?? null,
        type,
      },
      include: { group: { select: { id: true, name: true } } },
    });

    return res.status(201).json(category);
  } catch (err) {
    console.error('[settings/categories POST]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const categoryUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  emoji: z.string().optional(),
  groupId: z.string().optional().nullable(),
  isTaxDeductible: z.boolean().optional(),
});

// PUT /api/v1/settings/categories/:id
router.put('/categories/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const parsed = categoryUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid request' });
    }
    const { name, emoji, groupId, isTaxDeductible } = parsed.data;

    const existing = await prisma.category.findFirst({
      where: { id, householdId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (emoji !== undefined) updateData.emoji = emoji;
    if (groupId !== undefined) updateData.groupId = groupId;
    if (isTaxDeductible !== undefined) updateData.isTaxDeductible = isTaxDeductible;

    const category = await prisma.category.update({
      where: { id },
      data: updateData,
      include: { group: { select: { id: true, name: true } } },
    });

    return res.json(category);
  } catch (err) {
    console.error('[settings/categories PUT]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/settings/categories/:id
router.delete('/categories/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const existing = await prisma.category.findFirst({
      where: { id, householdId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Check if any transactions use this category
    const txCount = await prisma.transaction.count({
      where: { categoryId: id, householdId },
    });
    if (txCount > 0) {
      return res.status(400).json({
        error: `Cannot delete category: it is used by ${txCount} transaction${txCount !== 1 ? 's' : ''}. Reassign them first.`,
      });
    }

    await prisma.category.delete({ where: { id } });

    return res.json({ success: true });
  } catch (err) {
    console.error('[settings/categories DELETE]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/settings/tags
router.get('/tags', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const tags = await prisma.tag.findMany({
      where: { householdId },
      include: { _count: { select: { transactionTags: true } } },
      orderBy: { name: 'asc' },
    });
    return res.json(tags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      transactionCount: t._count.transactionTags,
    })));
  } catch (err) {
    console.error('[settings/tags GET]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/settings/tags
router.post('/tags', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { name, color } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const tag = await prisma.tag.create({
      data: {
        householdId,
        name: name.trim(),
        color: color ?? '#6366f1',
      },
    });

    return res.status(201).json({ id: tag.id, name: tag.name, color: tag.color, transactionCount: 0 });
  } catch (err) {
    console.error('[settings/tags POST]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/settings/tags/:id
router.put('/tags/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;
    const { name, color } = req.body;

    const existing = await prisma.tag.findFirst({ where: { id, householdId } });
    if (!existing) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return res.status(400).json({ error: 'name must be a non-empty string' });
    }

    const updateData: { name?: string; color?: string } = {};
    if (name !== undefined) updateData.name = name.trim();
    if (color !== undefined) updateData.color = color;

    const tag = await prisma.tag.update({ where: { id }, data: updateData });

    const count = await prisma.transactionTag.count({ where: { tagId: id } });
    return res.json({ id: tag.id, name: tag.name, color: tag.color, transactionCount: count });
  } catch (err) {
    console.error('[settings/tags PUT]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/settings/tags/:id
router.delete('/tags/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const existing = await prisma.tag.findFirst({ where: { id, householdId } });
    if (!existing) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    await prisma.tag.delete({ where: { id } });
    return res.json({ message: 'Tag deleted' });
  } catch (err) {
    console.error('[settings/tags DELETE]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Merchants ────────────────────────────────────────────────────────────────

// GET /api/v1/settings/merchants?order=TRANSACTION_COUNT|NAME
router.get('/merchants', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const order = req.query.order === 'NAME' ? 'NAME' : 'TRANSACTION_COUNT';

    const merchants = await prisma.merchant.findMany({
      where: { householdId },
      select: {
        id: true,
        name: true,
        displayName: true,
        logoUrl: true,
        _count: { select: { transactions: true } },
      },
      orderBy: order === 'NAME' ? { displayName: 'asc' } : { createdAt: 'asc' },
    });

    // Sort by transaction count client-side when needed (Prisma doesn't sort by _count directly in older versions)
    const result = merchants
      .map(m => ({
        id: m.id,
        name: m.name,
        displayName: m.displayName,
        logoUrl: m.logoUrl ?? null,
        transactionCount: m._count.transactions,
      }))
      .sort((a, b) =>
        order === 'TRANSACTION_COUNT'
          ? b.transactionCount - a.transactionCount
          : a.displayName.localeCompare(b.displayName)
      );

    return res.json(result);
  } catch (err) {
    console.error('[settings/merchants GET]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/settings/merchants/:id
router.put('/merchants/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;
    const { displayName } = req.body;

    if (!displayName || typeof displayName !== 'string' || displayName.trim().length === 0) {
      return res.status(400).json({ error: 'displayName is required and must be non-empty' });
    }
    if (displayName.trim().length > 100) {
      return res.status(400).json({ error: 'displayName must be 100 characters or fewer' });
    }

    const existing = await prisma.merchant.findFirst({ where: { id, householdId } });
    if (!existing) return res.status(404).json({ error: 'Merchant not found' });

    const updated = await prisma.merchant.update({
      where: { id },
      data: { displayName: displayName.trim() },
      select: { id: true, name: true, displayName: true, logoUrl: true },
    });

    return res.json({ ...updated, logoUrl: updated.logoUrl ?? null });
  } catch (err) {
    console.error('[settings/merchants PUT]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/settings/merchants/:id
router.delete('/merchants/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const existing = await prisma.merchant.findFirst({ where: { id, householdId } });
    if (!existing) return res.status(404).json({ error: 'Merchant not found' });

    // Null out merchantId on linked transactions before deleting
    await prisma.transaction.updateMany({
      where: { merchantId: id, householdId },
      data: { merchantId: null },
    });

    await prisma.merchant.delete({ where: { id } });
    return res.json({ message: 'Merchant deleted' });
  } catch (err) {
    console.error('[settings/merchants DELETE]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/settings/notifications
router.get('/notifications', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

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
    return res.json({ preferences, lowBalanceThreshold });
  } catch (err) {
    console.error('[settings/notifications GET]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/settings/notifications
router.put('/notifications', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { preferences, lowBalanceThreshold } = req.body;

    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({ error: 'preferences must be an object' });
    }

    await prisma.userPreference.upsert({
      where: { userId_key: { userId, key: 'notification_preferences' } },
      update: { value: JSON.stringify(preferences) },
      create: { userId, key: 'notification_preferences', value: JSON.stringify(preferences) },
    });

    if (lowBalanceThreshold !== undefined) {
      if (lowBalanceThreshold === null) {
        await prisma.userPreference.deleteMany({ where: { userId, key: 'low_balance_threshold' } });
      } else if (typeof lowBalanceThreshold === 'number' && lowBalanceThreshold >= 0) {
        await prisma.userPreference.upsert({
          where: { userId_key: { userId, key: 'low_balance_threshold' } },
          update: { value: String(lowBalanceThreshold) },
          create: { userId, key: 'low_balance_threshold', value: String(lowBalanceThreshold) },
        });
      }
    }
    return res.json({ preferences, lowBalanceThreshold: lowBalanceThreshold ?? null });
  } catch (err) {
    console.error('[settings/notifications PUT]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/settings/password
router.put('/password', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('[settings/password PUT]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Dashboard Layout ─────────────────────────────────────────────────────────

// GET /api/v1/settings/dashboard-layout
router.get('/dashboard-layout', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const pref = await prisma.userPreference.findUnique({
      where: { userId_key: { userId, key: 'dashboard_layout' } },
    });

    if (!pref) {
      return res.json(null);
    }

    try {
      return res.json(JSON.parse(pref.value));
    } catch {
      return res.json(null);
    }
  } catch (err) {
    console.error('[settings/dashboard-layout GET]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/settings/dashboard-layout
router.put('/dashboard-layout', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { layout } = req.body;

    if (!Array.isArray(layout)) {
      return res.status(400).json({ error: 'layout must be an array' });
    }

    for (const item of layout) {
      if (
        typeof item !== 'object' ||
        typeof item.id !== 'string' ||
        typeof item.visible !== 'boolean' ||
        typeof item.order !== 'number'
      ) {
        return res.status(400).json({ error: 'Each layout item must have id (string), visible (boolean), order (number)' });
      }
    }

    await prisma.userPreference.upsert({
      where: { userId_key: { userId, key: 'dashboard_layout' } },
      update: { value: JSON.stringify(layout) },
      create: { userId, key: 'dashboard_layout', value: JSON.stringify(layout) },
    });

    return res.json(layout);
  } catch (err) {
    console.error('[settings/dashboard-layout PUT]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── AI Config ────────────────────────────────────────────────────────────────

const aiConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'gemini', 'openrouter', 'none']),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});

function formatAiConfigResponse(config: {
  provider: string;
  model: string;
  encryptedApiKey: string;
  baseUrl: string | null;
  updatedAt: Date;
} | null) {
  if (!config) {
    return { provider: 'none', model: '', baseUrl: null, hasApiKey: false, updatedAt: null };
  }
  return {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    hasApiKey: config.encryptedApiKey !== '',
    updatedAt: config.updatedAt.toISOString(),
  };
}

// GET /api/v1/settings/ai-config
router.get('/ai-config', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const config = await prisma.aiConfig.findUnique({ where: { householdId } });
    return res.json(formatAiConfigResponse(config));
  } catch (err) {
    console.error('[settings/ai-config GET]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/settings/ai-config
router.put('/ai-config', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const parsed = aiConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid request' });
    }
    const { provider, model, apiKey, baseUrl } = parsed.data;

    // Determine encrypted key: if a new apiKey is provided, encrypt it; otherwise keep existing
    let encryptedApiKey: string | undefined;
    if (apiKey && apiKey.trim() !== '') {
      encryptedApiKey = encrypt(apiKey.trim());
    }

    const existing = encryptedApiKey === undefined
      ? await prisma.aiConfig.findUnique({ where: { householdId }, select: { encryptedApiKey: true } })
      : null;

    const config = await prisma.aiConfig.upsert({
      where: { householdId },
      update: {
        provider,
        model: model ?? '',
        ...(encryptedApiKey !== undefined ? { encryptedApiKey } : { encryptedApiKey: existing?.encryptedApiKey ?? '' }),
        baseUrl: baseUrl ?? null,
      },
      create: {
        householdId,
        provider,
        model: model ?? '',
        encryptedApiKey: encryptedApiKey ?? '',
        baseUrl: baseUrl ?? null,
      },
    });

    invalidateAiCache(householdId);
    return res.json(formatAiConfigResponse(config));
  } catch (err) {
    console.error('[settings/ai-config PUT]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/settings/ai-config/test
router.post('/ai-config/test', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const config = await prisma.aiConfig.findUnique({ where: { householdId } });

    if (!config || config.provider === 'none') {
      return res.json({ valid: false, error: 'No provider configured' });
    }

    const client = getAiClient(config);
    const valid = await client.validateApiKey();
    return res.json({ valid });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Connection test failed';
    return res.json({ valid: false, error: message });
  }
});

// GET /api/v1/settings/watch-tickers
router.get('/watch-tickers', async (req: AuthRequest, res: Response) => {
  const pref = await prisma.userPreference.findFirst({
    where: { userId: req.userId!, key: 'watch_tickers' },
  });
  return res.json({ tickers: pref?.value ?? '' });
});

// PUT /api/v1/settings/watch-tickers
router.put('/watch-tickers', async (req: AuthRequest, res: Response) => {
  const parse = z.object({ tickers: z.string().max(500) }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Invalid tickers' });
  await prisma.userPreference.upsert({
    where: { userId_key: { userId: req.userId!, key: 'watch_tickers' } },
    update: { value: parse.data.tickers },
    create: { userId: req.userId!, key: 'watch_tickers', value: parse.data.tickers },
  });
  return res.json({ tickers: parse.data.tickers });
});

// DELETE /api/v1/settings/account — self-service account deletion
router.delete('/account', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const householdId = req.householdId!;

    const deleteSchema = z.object({ confirmPassword: z.string().min(1) });
    const parse = deleteSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: 'confirmPassword is required' });

    // Verify password
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const valid = await bcrypt.compare(parse.data.confirmPassword, user.passwordHash);
    if (!valid) return res.status(400).json({ error: 'Incorrect password' });

    // Check if owner with other members
    const membership = await prisma.householdMember.findFirst({ where: { userId, householdId } });
    if (membership?.role === 'owner') {
      const memberCount = await prisma.householdMember.count({ where: { householdId } });
      if (memberCount > 1) {
        return res.status(400).json({ error: 'Transfer ownership or remove all other members before deleting your account' });
      }
    }

    // Invalidate all refresh tokens and API tokens
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.apiToken.deleteMany({ where: { userId } });

    if (membership?.role === 'owner') {
      // Delete the household and all its data (cascade via Prisma)
      await prisma.household.delete({ where: { id: householdId } });
    }

    // Delete user
    await prisma.user.delete({ where: { id: userId } });

    res.clearCookie('refreshToken');
    return res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error('[settings/account DELETE]', err);
    return res.status(500).json({ error: 'Failed to delete account' });
  }
});

// GET /api/v1/settings/export — full data export as multi-sheet Excel workbook
router.get('/export', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
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
    accounts.forEach(a => accSheet.addRow({ name: a.name, type: a.type, institution: a.institution ?? '', balance: a.balance, currency: a.currency, creditLimit: a.creditLimit ?? '', isHidden: a.isHidden }));

    // Transactions
    const transactions = await prisma.transaction.findMany({
      where: { householdId, isHidden: false },
      include: { category: { select: { name: true } }, account: { select: { name: true } }, merchant: { select: { name: true } } },
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
    transactions.forEach(t => txSheet.addRow({ date: t.date.toISOString().split('T')[0], description: t.description, amount: t.amount, category: t.category?.name ?? '', account: t.account?.name ?? '', merchant: t.merchant?.name ?? '', notes: t.notes ?? '' }));

    // Budgets
    const budgets = await prisma.budget.findMany({ where: { householdId }, include: { category: { select: { name: true } } } });
    const budgetSheet = workbook.addWorksheet('Budgets');
    budgetSheet.columns = [
      { header: 'Category', key: 'category', width: 24 },
      { header: 'Amount', key: 'amount', width: 14 },
      { header: 'Period', key: 'period', width: 14 },
      { header: 'Budget Type', key: 'budgetType', width: 14 },
    ];
    budgets.forEach(b => budgetSheet.addRow({ category: b.category?.name ?? b.name ?? '', amount: b.amount, period: b.period, budgetType: b.budgetType }));

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
    goals.forEach(g => goalsSheet.addRow({ name: g.name, type: g.type, targetAmount: g.targetAmount, currentAmount: g.currentAmount, targetDate: g.targetDate ? g.targetDate.toISOString().split('T')[0] : '', monthlyContribution: g.monthlyContribution }));

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
    recurring.forEach(r => recurringSheet.addRow({ name: r.name, amount: r.amount, frequency: r.frequency, nextDate: r.nextDate.toISOString().split('T')[0], account: r.account?.name ?? '', category: r.category?.name ?? '', isActive: r.isActive }));

    // Investments
    const investments = await prisma.investmentHolding.findMany({ where: { account: { householdId } }, orderBy: { symbol: 'asc' } });
    const investSheet = workbook.addWorksheet('Investments');
    investSheet.columns = [
      { header: 'Symbol', key: 'symbol', width: 12 },
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Shares', key: 'shares', width: 12 },
      { header: 'Cost Basis', key: 'costBasis', width: 14 },
      { header: 'Current Price', key: 'currentPrice', width: 14 },
      { header: 'Asset Class', key: 'assetClass', width: 16 },
    ];
    investments.forEach(i => investSheet.addRow({ symbol: i.symbol, name: i.name, shares: i.shares, costBasis: i.costBasis, currentPrice: i.currentPrice, assetClass: i.assetClass }));

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
    assets.forEach(a => assetsSheet.addRow({ name: a.name, assetType: a.type, currentValue: a.currentValue, purchaseValue: a.purchaseValue ?? '', currency: a.currency }));

    // Liabilities
    const liabilities = await prisma.manualLiability.findMany({ where: { householdId }, orderBy: { name: 'asc' } });
    const liabSheet = workbook.addWorksheet('Liabilities');
    liabSheet.columns = [
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Type', key: 'type', width: 16 },
      { header: 'Current Balance', key: 'currentBalance', width: 16 },
      { header: 'Interest Rate', key: 'interestRate', width: 14 },
      { header: 'Monthly Payment', key: 'monthlyPayment', width: 16 },
      { header: 'Currency', key: 'currency', width: 10 },
    ];
    liabilities.forEach(l => liabSheet.addRow({ name: l.name, type: l.type, currentBalance: l.currentBalance, interestRate: l.interestRate ?? '', monthlyPayment: l.monthlyPayment ?? '', currency: l.currency }));

    // Stream the workbook
    const fileName = `kuber-export-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
    return res.end();
  } catch (err) {
    console.error('[settings/export GET]', err);
    return res.status(500).json({ error: 'Failed to generate export' });
  }
});

// POST /api/v1/settings/email/test
router.post('/email/test', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    await sendTestEmail(user.email);
    return res.json({ message: `Test email sent to ${user.email}` });
  } catch (err) {
    console.error('[settings/email/test]', err);
    return res.status(500).json({ error: 'Failed to send test email. Check your SMTP configuration.' });
  }
});

export default router;
