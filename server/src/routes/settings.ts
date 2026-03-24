import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { sendTestEmail } from '../lib/email';

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

// PUT /api/v1/settings/categories/:id
router.put('/categories/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;
    const { name, emoji, groupId } = req.body;

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

    return res.json({ preferences });
  } catch (err) {
    console.error('[settings/notifications GET]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/settings/notifications
router.put('/notifications', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { preferences } = req.body;

    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({ error: 'preferences must be an object' });
    }

    await prisma.userPreference.upsert({
      where: { userId_key: { userId, key: 'notification_preferences' } },
      update: { value: JSON.stringify(preferences) },
      create: { userId, key: 'notification_preferences', value: JSON.stringify(preferences) },
    });

    return res.json({ preferences });
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
