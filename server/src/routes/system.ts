import { Router, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma';
import { AuthRequest, requireHouseholdRole } from '../middleware/auth';
import { encrypt, decrypt } from '../lib/encryption';

const triggerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many trigger requests, please wait before retrying' },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();
const requireHouseholdAdmin = requireHouseholdRole(['owner', 'admin']);
router.use(requireHouseholdAdmin);

// ── Defaults ──────────────────────────────────────────────────────────────────

export const AUTOMATION_DEFAULTS = {
  ruleEngineEnabled: true,
  billMatcherEnabled: true,
  billMatcherConfidence: 80,
  autoCategorizeEnabled: true,
};

export const INTEGRATIONS_DEFAULTS = {
  imapEnabled: false,
  imapHost: '',
  imapPort: 993,
  imapUser: '',
  imapPass: '',
  digestEnabled: false,
  digestSchedule: 'weekly' as 'daily' | 'weekly',
  webhooksEnabled: true,
};

export const AI_DEFAULTS = {
  proactiveAiEnabled: true,
  proactiveAiFrequency: 'daily' as 'daily' | 'weekly' | 'on_login',
  investmentIntelEnabled: true,
  wealthAnalysisEnabled: true,
};

// ── Zod schemas ───────────────────────────────────────────────────────────────

const AutomationSchema = z.object({
  ruleEngineEnabled: z.boolean(),
  billMatcherEnabled: z.boolean(),
  billMatcherConfidence: z.number().int().min(0).max(100),
  autoCategorizeEnabled: z.boolean(),
});

const IntegrationsSchema = z.object({
  imapEnabled: z.boolean(),
  imapHost: z.string(),
  imapPort: z.number().int().min(1).max(65535),
  imapUser: z.string(),
  imapPass: z.string(),
  digestEnabled: z.boolean(),
  digestSchedule: z.enum(['daily', 'weekly']),
  webhooksEnabled: z.boolean(),
});

const AiSchema = z.object({
  proactiveAiEnabled: z.boolean(),
  proactiveAiFrequency: z.enum(['daily', 'weekly', 'on_login']),
  investmentIntelEnabled: z.boolean(),
  wealthAnalysisEnabled: z.boolean(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getConfig<T extends object>(userId: string, key: string, defaults: T): Promise<T> {
  const pref = await prisma.userPreference.findUnique({
    where: { userId_key: { userId, key } },
  });
  if (!pref) return defaults;
  try {
    return { ...defaults, ...JSON.parse(pref.value) };
  } catch {
    return defaults;
  }
}

async function saveConfig(userId: string, key: string, value: object): Promise<void> {
  await prisma.userPreference.upsert({
    where: { userId_key: { userId, key } },
    update: { value: JSON.stringify(value) },
    create: { userId, key, value: JSON.stringify(value) },
  });
}

// ── Automation ────────────────────────────────────────────────────────────────

router.get('/automation', async (req: AuthRequest, res: Response) => {
  try {
    const config = await getConfig(req.userId!, 'system.automation', AUTOMATION_DEFAULTS);
    return res.json(config);
  } catch (err) {
    req.log.error({ err }, 'system/automation GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/automation', async (req: AuthRequest, res: Response) => {
  const parsed = AutomationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  try {
    await saveConfig(req.userId!, 'system.automation', parsed.data);
    return res.json(parsed.data);
  } catch (err) {
    req.log.error({ err }, 'system/automation PUT');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Integrations ──────────────────────────────────────────────────────────────

router.get('/integrations', async (req: AuthRequest, res: Response) => {
  try {
    const config = await getConfig(req.userId!, 'system.integrations', INTEGRATIONS_DEFAULTS);
    let imapPassSet = false;
    if (config.imapPass) {
      try {
        const decrypted = decrypt(config.imapPass);
        imapPassSet = decrypted.length > 0;
      } catch {
        imapPassSet = false;
      }
    }
    const { imapPass: _omit, ...rest } = config;
    return res.json({ ...rest, imapPassSet });
  } catch (err) {
    req.log.error({ err }, 'system/integrations GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/integrations', async (req: AuthRequest, res: Response) => {
  const parsed = IntegrationsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  try {
    let dataToSave = parsed.data;
    if (!parsed.data.imapPass) {
      const existing = await getConfig(req.userId!, 'system.integrations', INTEGRATIONS_DEFAULTS);
      dataToSave = { ...parsed.data, imapPass: existing.imapPass };
    } else {
      dataToSave = { ...parsed.data, imapPass: encrypt(parsed.data.imapPass) };
    }
    await saveConfig(req.userId!, 'system.integrations', dataToSave);
    const { imapPass: _omit, ...rest } = dataToSave;
    return res.json({ ...rest, imapPassSet: !!dataToSave.imapPass });
  } catch (err) {
    req.log.error({ err }, 'system/integrations PUT');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── AI ────────────────────────────────────────────────────────────────────────

router.get('/ai', async (req: AuthRequest, res: Response) => {
  try {
    const config = await getConfig(req.userId!, 'system.ai', AI_DEFAULTS);
    return res.json(config);
  } catch (err) {
    req.log.error({ err }, 'system/ai GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/ai', async (req: AuthRequest, res: Response) => {
  const parsed = AiSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  try {
    await saveConfig(req.userId!, 'system.ai', parsed.data);
    return res.json(parsed.data);
  } catch (err) {
    req.log.error({ err }, 'system/ai PUT');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Triggers ──────────────────────────────────────────────────────────────────

router.post('/automation/auto-categorize/trigger', triggerLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { batchAutoCategorize } = await import('../lib/autoCategorize.js');
    await batchAutoCategorize(prisma, req.householdId!);
    return res.json({ message: 'Auto-categorize triggered successfully' });
  } catch (err) {
    req.log.error({ err }, 'system/auto-categorize trigger');
    return res.status(500).json({ error: 'Auto-categorize failed' });
  }
});

router.post('/integrations/imap/test', triggerLimiter, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    user: z.string().min(1),
    pass: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  try {
    const { testImapConnection } = await import('../lib/imapWatcher.js');
    await testImapConnection(parsed.data);
    return res.json({ message: 'IMAP connection successful' });
  } catch (err) {
    req.log.error({ err }, 'system/integrations/imap test');
    return res.status(400).json({ error: 'IMAP connection failed' });
  }
});

router.post('/integrations/digest/trigger', triggerLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { sendDigestEmail } = await import('../lib/digestEmail.js');
    await sendDigestEmail(req.householdId!);
    return res.json({ message: 'Digest email sent successfully' });
  } catch (err) {
    req.log.error({ err }, 'system/digest trigger');
    return res.status(500).json({ error: 'Digest email failed' });
  }
});

router.post('/ai/proactive/trigger', triggerLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { runProactiveChecks } = await import('../lib/proactiveAi.js');
    await runProactiveChecks(prisma, req.householdId!);
    return res.json({ message: 'Proactive AI checks triggered successfully' });
  } catch (err) {
    req.log.error({ err }, 'system/proactive trigger');
    return res.status(500).json({ error: 'Proactive AI failed' });
  }
});

router.post('/jobs/category-bucket-assign/trigger', triggerLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { runCategoryBucketJob } = await import('../lib/categoryBucketJob.js');
    const { updated, skipped } = await runCategoryBucketJob();
    return res.json({ message: 'Category bucket assignment triggered successfully', updated, skipped });
  } catch (err) {
    req.log.error({ err }, 'system/category-bucket-assign trigger');
    return res.status(500).json({ error: 'Category bucket assignment failed' });
  }
});

router.post('/jobs/icon-assignment/trigger', triggerLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { runIconAssignmentJob } = await import('../lib/iconAssignmentJob.js');
    const { assigned, skipped } = await runIconAssignmentJob();
    return res.json({ message: 'Icon assignment triggered successfully', assigned, skipped });
  } catch (err) {
    req.log.error({ err }, 'system/icon-assignment trigger');
    return res.status(500).json({ error: 'Icon assignment failed' });
  }
});

export default router;
