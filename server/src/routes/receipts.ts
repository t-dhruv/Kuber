/**
 * receipts.ts
 * Receipt OCR endpoint — accepts image upload, extracts transaction details via AI vision.
 * Falls back to text prompt if vision not available.
 */
import { Router, Response } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { getAiClientForHousehold } from '../lib/ai/index.js';

const router = Router();
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    const validExt = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif'].includes(ext ?? '');
    cb(null, validExt && ALLOWED_IMAGE_MIMES.has(file.mimetype));
  },
});

const NOT_CONFIGURED_MSG = 'AI provider not configured. Go to Settings → Integrations → AI Advisor to set up Claude, OpenAI, Gemini, or Ollama (free, runs locally).';

// POST /api/v1/receipts/ocr
router.post('/ocr', upload.single('receipt'), async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' }) as unknown as void;

  let client;
  try {
    client = await getAiClientForHousehold(req.householdId!, prisma);
  } catch {
    return res.json({ notConfigured: true, setupMessage: NOT_CONFIGURED_MSG }) as unknown as void;
  }

  try {
    // Convert image to base64 for AI vision prompt
    const base64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    // Build a vision prompt — works with Claude/OpenAI vision models
    // For providers without vision, fall back to text-only prompt
    const prompt = `Extract transaction details from this receipt image. Return ONLY valid JSON with these fields:
{
  "merchant": "store name",
  "amount": 12.34,
  "date": "YYYY-MM-DD",
  "description": "brief description"
}
If you cannot read the receipt clearly, return your best guess. Use today's date if date is unclear.`;

    let result;
    try {
      // Try vision-capable message format (Claude/OpenAI style)
      result = await client.complete({
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
            { type: 'text', text: prompt },
          ] as unknown as string, // TODO: replace when AI client types support array content natively
        }],
        maxTokens: 150,
        temperature: 0.1,
      });
    } catch {
      // Fall back to text-only (Ollama models without vision)
      result = await client.complete({
        messages: [{ role: 'user', content: `${prompt}\n\n(Note: Image could not be processed. Please return default values.)` }],
        maxTokens: 100,
        temperature: 0.1,
      });
    }

    const json = JSON.parse(result.content.match(/\{[\s\S]*?\}/)?.[0] ?? '{}');
    return res.json({
      merchant: json.merchant || null,
      amount: typeof json.amount === 'number' ? json.amount : parseFloat(json.amount) || null,
      date: json.date || null,
      description: json.description || json.merchant || null,
      notConfigured: false,
    }) as unknown as void;
  } catch (err) {
    req.log.error({ err }, 'receipts/ocr');
    return res.status(500).json({ error: 'OCR extraction failed' }) as unknown as void;
  }
});

export default router;
