import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getJobs, triggerJob } from '../lib/cronRegistry';

const router = Router();

// GET /api/v1/cron/jobs
// Returns all registered jobs with last-run metadata.
router.get('/jobs', (_req: AuthRequest, res: Response) => {
  return res.json(getJobs());
});

// POST /api/v1/cron/jobs/:name/trigger
// Manually triggers a registered job by name.
router.post('/jobs/:name/trigger', async (req: AuthRequest, res: Response) => {
  try {
    await triggerJob(req.params.name);
    return res.json({ message: 'Job triggered successfully' });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    req.log.error({ err }, 'cron/trigger');
    return res.status(500).json({ error: 'Job failed during execution' });
  }
});

export default router;