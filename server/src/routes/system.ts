import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const router = Router();

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
    return res.json(config);
  } catch (err) {
    req.log.error({ err }, 'system/integrations GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/integrations', async (req: AuthRequest, res: Response) => {
  const parsed = IntegrationsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  try {
    await saveConfig(req.userId!, 'system.integrations', parsed.data);
    return res.json(parsed.data);
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

export default router;
