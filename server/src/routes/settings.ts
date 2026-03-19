import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const router = Router();

const DEFAULT_NOTIFICATION_PREFERENCES: Record<string, boolean> = {
  budgetAlerts: true,
  goalMilestones: true,
  recurringReminders: true,
  weeklyDigest: false,
  monthlyReport: true,
  securityAlerts: true,
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

// GET /api/v1/settings/notifications
router.get('/notifications', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const pref = await prisma.userPreference.findUnique({
      where: { userId_key: { userId, key: 'notification_preferences' } },
    });

    let preferences: Record<string, boolean>;
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

export default router;
