import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: string;
  householdId?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET!) as { userId: string; householdId: string };
    req.userId = decoded.userId;
    req.householdId = decoded.householdId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
