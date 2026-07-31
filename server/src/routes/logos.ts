import { Response, Router } from 'express';
import { getOrFetchBankLogo, getOrFetchMerchantLogo } from '../services/logoService';

const router = Router();

// Cache keys are derived from this value, so bound it. A real institution or
// merchant name is far shorter than this.
const MAX_NAME_LENGTH = 128;

function sendLogo(res: Response, logo: { data: Buffer; mimeType: string } | null) {
  if (!logo) return res.status(404).end();
  res.setHeader('Content-Type', logo.mimeType);
  res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 days
  res.send(logo.data);
}

// GET /api/v1/logos/bank?name=Chase Bank
router.get('/bank', async (req, res) => {
  const name = (req.query.name as string)?.trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (name.length > MAX_NAME_LENGTH) return res.status(400).json({ error: 'name is too long' });

  const logo = await getOrFetchBankLogo(name);
  sendLogo(res, logo);
});

// GET /api/v1/logos/merchant?name=Amazon&domain=amazon.com
router.get('/merchant', async (req, res) => {
  const name = (req.query.name as string)?.trim();
  const domain = (req.query.domain as string)?.trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (name.length > MAX_NAME_LENGTH) return res.status(400).json({ error: 'name is too long' });
  if (domain && domain.length > MAX_NAME_LENGTH) return res.status(400).json({ error: 'domain is too long' });

  const logo = await getOrFetchMerchantLogo(name, domain);
  sendLogo(res, logo);
});

export default router;
