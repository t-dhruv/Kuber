import { Router, Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import {
  getEncryptionStatus,
  getWrappedHouseholdKey,
  setupHouseholdEncryption,
} from '../services/encryptionService';

const router = Router();

const setupSchema = z.object({
  wrappedKey: z.unknown(),
});

router.get('/encryption/status', async (req: AuthRequest, res: Response) => {
  try {
    return res.json(await getEncryptionStatus(req.householdId!, req.userId!));
  } catch (err) {
    req.log.error({ err }, 'security/encryption/status GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/encryption/setup', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = setupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'wrappedKey is required' });
    const result = await setupHouseholdEncryption(req.householdId!, req.userId!, parsed.data.wrappedKey);
    return res.status(201).json(result);
  } catch (err) {
    req.log.error({ err }, 'security/encryption/setup POST');
    return res.status(400).json({ error: 'Invalid encryption setup request' });
  }
});

router.get('/encryption/wrapped-key', async (req: AuthRequest, res: Response) => {
  try {
    const wrapped = await getWrappedHouseholdKey(req.householdId!, req.userId!);
    if (!wrapped) return res.status(404).json({ error: 'No wrapped key available' });
    return res.json(wrapped);
  } catch (err) {
    req.log.error({ err }, 'security/encryption/wrapped-key GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/encryption/rotate-key', async (_req: AuthRequest, res: Response) => {
  return res.status(501).json({ error: 'Key rotation is not available yet' });
});

export default router;
