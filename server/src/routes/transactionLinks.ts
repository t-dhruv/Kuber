import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { listLinkTypes, createLink, deleteLink, getLinksForTransaction } from '../lib/transactionLinks';

const router = Router();

// GET /api/v1/transaction-link-types
router.get('/transaction-link-types', async (_req: AuthRequest, res: Response) => {
  const types = await listLinkTypes();
  return res.json(types);
});

// GET /api/v1/transactions/:txId/links
router.get('/transactions/:txId/links', async (req: AuthRequest, res: Response) => {
  const links = await getLinksForTransaction({
    householdId:   req.householdId!,
    transactionId: req.params.txId,
  });
  return res.json(links);
});

// POST /api/v1/transaction-links
router.post('/transaction-links', async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    linkTypeId: z.string().min(1),
    fromId:     z.string().min(1),
    toId:       z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  try {
    const link = await createLink({ householdId: req.householdId!, ...parsed.data });
    return res.status(201).json(link);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('Cannot link')) {
      return res.status(400).json({ error: err.message });
    }
    req.log.error({ err }, 'transactionLinks/create');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/transaction-links/:id
router.delete('/transaction-links/:id', async (req: AuthRequest, res: Response) => {
  const deleted = await deleteLink(req.params.id, req.householdId!);
  if (!deleted) return res.status(404).json({ error: 'Link not found' });
  return res.json({ message: 'Deleted' });
});

export default router;