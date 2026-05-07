import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';

export interface AuthRequest extends Request {
  userId?: string;
  householdId?: string;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  const token = auth.slice(7);

  // Try JWT first
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string; householdId: string };
    req.userId = decoded.userId;
    req.householdId = decoded.householdId;
    // Bind householdId to the request logger so all route logs carry it automatically
    if (req.log) {
      req.log = req.log.child({ householdId: decoded.householdId });
    }
    return next();
  } catch {
    // JWT failed — fall through to API token check
  }

  // Try API token
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const apiToken = await prisma.apiToken.findUnique({ where: { tokenHash } });

    if (!apiToken) return res.status(401).json({ error: 'Invalid token' });
    if (apiToken.expiresAt && apiToken.expiresAt <= new Date()) {
      return res.status(401).json({ error: 'Token expired' });
    }

    // Fire-and-forget lastUsedAt update
    prisma.apiToken.update({ where: { id: apiToken.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

    req.userId = apiToken.userId;
    req.householdId = apiToken.householdId;
    if (req.log) {
      req.log = req.log.child({ householdId: apiToken.householdId });
    }
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireHouseholdRole(allowedRoles: string[]) {
  const normalizedRoles = allowedRoles.map(role => role.toLowerCase());

  return async function householdRoleMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
    const userId = req.userId;
    const householdId = req.householdId;

    if (!userId || !householdId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const membership = await prisma.householdMember.findUnique({
        where: { userId_householdId: { userId, householdId } },
        select: { role: true },
      });

      if (!membership || !normalizedRoles.includes(membership.role.toLowerCase())) {
        return res.status(403).json({ error: 'Insufficient household permissions' });
      }

      return next();
    } catch (err) {
      req.log?.error({ err }, 'household role authorization failed');
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}
