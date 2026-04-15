import { Router, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const router = Router();

const createSchema = z.object({
  name: z.string().min(1).max(100),
  expiresAt: z.string().datetime().optional(),
});

// POST / — create token
router.post('/', async (req: AuthRequest, res: Response) => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.issues[0]?.message });

  const { name, expiresAt } = parse.data;
  const householdId = req.householdId!;
  const userId = req.userId!;

  try {
    const plaintext = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(plaintext).digest('hex');

    const token = await prisma.apiToken.create({
      data: { householdId, userId, name, tokenHash, expiresAt: expiresAt ? new Date(expiresAt) : null },
    });

    return res.status(201).json({ id: token.id, name: token.name, token: plaintext, createdAt: token.createdAt });
  } catch (err: unknown) {
    const isPrismaUniqueViolation = typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002';
    if (isPrismaUniqueViolation) {
      return res.status(409).json({ error: 'An API token with this name already exists' });
    }
    req.log.error({ err }, 'apiTokens/POST');
    return res.status(500).json({ error: 'Failed to create API token' });
  }
});

// GET / — list tokens
router.get('/', async (req: AuthRequest, res: Response) => {
  const tokens = await prisma.apiToken.findMany({
    where: { householdId: req.householdId! },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, lastUsedAt: true, expiresAt: true, createdAt: true },
  });
  return res.json(tokens);
});

// DELETE /:id — revoke
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const token = await prisma.apiToken.findFirst({
    where: { id: req.params.id, householdId: req.householdId! },
  });
  if (!token) return res.status(404).json({ error: 'Token not found' });
  await prisma.apiToken.delete({ where: { id: token.id } });
  return res.json({ message: 'Revoked' });
});

export default router;
