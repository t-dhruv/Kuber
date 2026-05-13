import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import type { UserDto } from '@kuber/shared';

const router = Router();

function toUserDto(user: { id: string; email: string; firstName: string; lastName: string; avatar: string | null; timezone: string; theme: string }, householdId: string): UserDto {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatar: user.avatar,
    timezone: user.timezone,
    theme: user.theme as 'light' | 'dark' | 'system',
    householdId,
  };
}

// GET /me
router.get('/me', async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json(toUserDto(user, req.householdId!));
  } catch (err) {
    req.log.error({ err }, 'users/me GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /me
router.put('/me', async (req: AuthRequest, res: Response) => {
  try {
    const { firstName, lastName, avatar, timezone, theme } = req.body as {
      firstName?: string;
      lastName?: string;
      avatar?: string;
      timezone?: string;
      theme?: 'light' | 'dark' | 'system';
    };

    const updated = await prisma.user.update({
      where: { id: req.userId! },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(avatar !== undefined && { avatar }),
        ...(timezone !== undefined && { timezone }),
        ...(theme !== undefined && { theme }),
      },
    });

    return res.json(toUserDto(updated, req.householdId!));
  } catch (err) {
    req.log.error({ err }, 'users/me PUT');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
