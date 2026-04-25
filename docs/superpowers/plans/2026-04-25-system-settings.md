# System Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/settings/system/*` sub-routes that surface all hidden background features (cron jobs, automation, integrations, AI) with full view + trigger + configure control.

**Architecture:** Four lazy-loaded sub-pages under a shared `SystemSettingsLayout` sidebar. Backend exposes `GET/PUT /api/v1/system/{automation|integrations|ai}` routes storing config in the existing `UserPreference` table as JSON blobs. Cron trigger endpoints already exist; new trigger endpoints follow the same pattern.

**Tech Stack:** React 18 + TypeScript + TanStack Query v5 + Tailwind CSS v4 | Express 4 + Prisma + Zod | Vitest

---

## File Map

**Create (frontend):**
```
client/src/pages/settings/system/components/StatusBadge.tsx
client/src/pages/settings/system/components/SectionCard.tsx
client/src/pages/settings/system/components/TriggerButton.tsx
client/src/pages/settings/system/SystemSettingsLayout.tsx
client/src/pages/settings/system/JobsPage.tsx
client/src/pages/settings/system/AutomationPage.tsx
client/src/pages/settings/system/IntegrationsPage.tsx
client/src/pages/settings/system/AiPage.tsx
client/src/pages/settings/system/index.tsx
```

**Create (backend):**
```
server/src/routes/system.ts
server/src/routes/system.test.ts
```

**Modify:**
```
client/src/App.tsx                          — add /settings/system/* lazy routes
client/src/pages/settings/SettingsPage.tsx  — add "System" nav link
server/src/index.ts                         — mount systemRouter
```

---

## Task 1: Backend — system config routes

**Files:**
- Create: `server/src/routes/system.ts`
- Create: `server/src/routes/system.test.ts`

### Defaults

```typescript
// Used in both route handler and tests
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
```

- [ ] **Step 1: Write failing tests**

```typescript
// server/src/routes/system.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import systemRouter from './system';
import { prisma } from '../lib/prisma';

vi.mock('../lib/prisma', () => ({
  prisma: {
    userPreference: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

function makeApp(householdId = 'hh1', userId = 'u1') {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.householdId = householdId;
    req.userId = userId;
    next();
  });
  app.use('/system', systemRouter);
  return app;
}

describe('GET /system/automation', () => {
  it('returns defaults when no preference stored', async () => {
    vi.mocked(prisma.userPreference.findUnique).mockResolvedValue(null);
    const res = await request(makeApp()).get('/system/automation');
    expect(res.status).toBe(200);
    expect(res.body.ruleEngineEnabled).toBe(true);
    expect(res.body.billMatcherConfidence).toBe(80);
  });

  it('returns stored config when preference exists', async () => {
    vi.mocked(prisma.userPreference.findUnique).mockResolvedValue({
      value: JSON.stringify({ ruleEngineEnabled: false, billMatcherEnabled: true, billMatcherConfidence: 60, autoCategorizeEnabled: false }),
    } as any);
    const res = await request(makeApp()).get('/system/automation');
    expect(res.status).toBe(200);
    expect(res.body.ruleEngineEnabled).toBe(false);
    expect(res.body.billMatcherConfidence).toBe(60);
  });
});

describe('PUT /system/automation', () => {
  it('saves valid config and returns it', async () => {
    vi.mocked(prisma.userPreference.upsert).mockResolvedValue({} as any);
    const body = { ruleEngineEnabled: false, billMatcherEnabled: true, billMatcherConfidence: 70, autoCategorizeEnabled: true };
    const res = await request(makeApp()).put('/system/automation').send(body);
    expect(res.status).toBe(200);
    expect(res.body.ruleEngineEnabled).toBe(false);
    expect(prisma.userPreference.upsert).toHaveBeenCalled();
  });

  it('rejects invalid billMatcherConfidence', async () => {
    const res = await request(makeApp()).put('/system/automation').send({ billMatcherConfidence: 150 });
    expect(res.status).toBe(400);
  });
});

describe('GET /system/integrations', () => {
  it('returns defaults when no preference stored', async () => {
    vi.mocked(prisma.userPreference.findUnique).mockResolvedValue(null);
    const res = await request(makeApp()).get('/system/integrations');
    expect(res.status).toBe(200);
    expect(res.body.imapEnabled).toBe(false);
    expect(res.body.digestSchedule).toBe('weekly');
  });
});

describe('GET /system/ai', () => {
  it('returns defaults when no preference stored', async () => {
    vi.mocked(prisma.userPreference.findUnique).mockResolvedValue(null);
    const res = await request(makeApp()).get('/system/ai');
    expect(res.status).toBe(200);
    expect(res.body.proactiveAiEnabled).toBe(true);
    expect(res.body.proactiveAiFrequency).toBe('daily');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd server && npx vitest run src/routes/system.test.ts
```
Expected: `Cannot find module './system'`

- [ ] **Step 3: Implement `server/src/routes/system.ts`**

```typescript
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

async function getConfig<T extends object>(householdId: string, key: string, defaults: T): Promise<T> {
  const pref = await prisma.userPreference.findUnique({
    where: { householdId_key: { householdId, key } },
  });
  if (!pref) return defaults;
  try {
    return { ...defaults, ...JSON.parse(pref.value) };
  } catch {
    return defaults;
  }
}

async function saveConfig(householdId: string, key: string, value: object): Promise<void> {
  await prisma.userPreference.upsert({
    where: { householdId_key: { householdId, key } },
    update: { value: JSON.stringify(value) },
    create: { householdId, key, value: JSON.stringify(value) },
  });
}

// ── Automation ────────────────────────────────────────────────────────────────

router.get('/automation', async (req: AuthRequest, res: Response) => {
  try {
    const config = await getConfig(req.householdId!, 'system.automation', AUTOMATION_DEFAULTS);
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
    await saveConfig(req.householdId!, 'system.automation', parsed.data);
    return res.json(parsed.data);
  } catch (err) {
    req.log.error({ err }, 'system/automation PUT');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Integrations ──────────────────────────────────────────────────────────────

router.get('/integrations', async (req: AuthRequest, res: Response) => {
  try {
    const config = await getConfig(req.householdId!, 'system.integrations', INTEGRATIONS_DEFAULTS);
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
    await saveConfig(req.householdId!, 'system.integrations', parsed.data);
    return res.json(parsed.data);
  } catch (err) {
    req.log.error({ err }, 'system/integrations PUT');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── AI ────────────────────────────────────────────────────────────────────────

router.get('/ai', async (req: AuthRequest, res: Response) => {
  try {
    const config = await getConfig(req.householdId!, 'system.ai', AI_DEFAULTS);
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
    await saveConfig(req.householdId!, 'system.ai', parsed.data);
    return res.json(parsed.data);
  } catch (err) {
    req.log.error({ err }, 'system/ai PUT');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd server && npx vitest run src/routes/system.test.ts
```
Expected: all 6 tests pass.

- [ ] **Step 5: Mount router in `server/src/index.ts`**

Add after the existing `import cronRouter`:
```typescript
import systemRouter from './routes/system';
```

Add after the line `app.use('/api/v1/cron', requireAuth, cronRouter);`:
```typescript
app.use('/api/v1/system', requireAuth, systemRouter);
```

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/system.ts server/src/routes/system.test.ts server/src/index.ts
git commit -m "feat(system): add system config routes for automation, integrations, and ai"
```

---

## Task 2: Backend — trigger endpoints

**Files:**
- Modify: `server/src/routes/system.ts`

The cron jobs already have trigger endpoints. We need triggers for: run-auto-categorize, test-imap-connection, send-digest-now, run-investment-intel, run-wealth-analysis, run-proactive-ai.

- [ ] **Step 1: Add trigger routes to `server/src/routes/system.ts`**

Add these routes before `export default router;`:

```typescript
// ── Triggers ──────────────────────────────────────────────────────────────────

router.post('/automation/auto-categorize/trigger', async (req: AuthRequest, res: Response) => {
  try {
    const { runAutoCategorize } = await import('../lib/autoCategorize.js');
    await runAutoCategorize(req.householdId!);
    return res.json({ message: 'Auto-categorize triggered successfully' });
  } catch (err) {
    req.log.error({ err }, 'system/auto-categorize trigger');
    return res.status(500).json({ error: 'Auto-categorize failed' });
  }
});

router.post('/integrations/imap/test', async (req: AuthRequest, res: Response) => {
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
    return res.status(400).json({ error: `Connection failed: ${String(err)}` });
  }
});

router.post('/integrations/digest/trigger', async (req: AuthRequest, res: Response) => {
  try {
    const { sendDigestEmail } = await import('../lib/digestEmail.js');
    await sendDigestEmail(req.householdId!);
    return res.json({ message: 'Digest email sent successfully' });
  } catch (err) {
    req.log.error({ err }, 'system/digest trigger');
    return res.status(500).json({ error: 'Digest email failed' });
  }
});

router.post('/ai/proactive/trigger', async (req: AuthRequest, res: Response) => {
  try {
    const { runProactiveChecks } = await import('../lib/proactiveAi.js');
    await runProactiveChecks(req.householdId!);
    return res.json({ message: 'Proactive AI checks triggered successfully' });
  } catch (err) {
    req.log.error({ err }, 'system/proactive trigger');
    return res.status(500).json({ error: 'Proactive AI failed' });
  }
});

router.post('/ai/investment-intel/trigger', async (req: AuthRequest, res: Response) => {
  try {
    const { refreshInvestmentIntel } = await import('../lib/investmentIntel.js');
    await refreshInvestmentIntel(req.householdId!);
    return res.json({ message: 'Investment intel refreshed successfully' });
  } catch (err) {
    req.log.error({ err }, 'system/investment-intel trigger');
    return res.status(500).json({ error: 'Investment intel refresh failed' });
  }
});

router.post('/ai/wealth/trigger', async (req: AuthRequest, res: Response) => {
  try {
    const { runWealthAnalysis } = await import('../lib/wealthAnalysis.js');
    await runWealthAnalysis(req.householdId!);
    return res.json({ message: 'Wealth analysis recalculated successfully' });
  } catch (err) {
    req.log.error({ err }, 'system/wealth trigger');
    return res.status(500).json({ error: 'Wealth analysis failed' });
  }
});
```

- [ ] **Step 2: Check which lib functions exist and adjust imports**

Run:
```bash
grep -l "export.*function\|export.*async" server/src/lib/autoCategorize.ts server/src/lib/imapWatcher.ts server/src/lib/digestEmail.ts server/src/lib/proactiveAi.ts server/src/lib/wealthAnalysis.ts
```

For each lib file, check the exported function names match what's used above. If a function name differs, update the import in `system.ts` to match the actual export.

For `imapWatcher.ts` — if `testImapConnection` doesn't exist, add it:
```typescript
// server/src/lib/imapWatcher.ts — add at bottom if missing
export async function testImapConnection(cfg: { host: string; port: number; user: string; pass: string }): Promise<void> {
  const Imap = (await import('imap')).default;
  await new Promise<void>((resolve, reject) => {
    const imap = new Imap({ user: cfg.user, password: cfg.pass, host: cfg.host, port: cfg.port, tls: true });
    imap.once('ready', () => { imap.end(); resolve(); });
    imap.once('error', reject);
    imap.connect();
  });
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd server && npx tsc --noEmit
```
Fix any type errors before continuing.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/system.ts server/src/lib/imapWatcher.ts
git commit -m "feat(system): add trigger endpoints for automation, integrations, and ai features"
```

---

## Task 3: Shared frontend components

**Files:**
- Create: `client/src/pages/settings/system/components/StatusBadge.tsx`
- Create: `client/src/pages/settings/system/components/SectionCard.tsx`
- Create: `client/src/pages/settings/system/components/TriggerButton.tsx`

- [ ] **Step 1: Create `StatusBadge.tsx`**

```typescript
// client/src/pages/settings/system/components/StatusBadge.tsx
type Status = 'ok' | 'error' | 'running' | 'disabled';

const styles: Record<Status, string> = {
  ok:       'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  error:    'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  running:  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  disabled: 'bg-[var(--color-surface-raised)] text-[var(--color-text-muted)]',
};

const labels: Record<Status, string> = {
  ok: 'OK', error: 'Error', running: 'Running', disabled: 'Disabled',
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
```

- [ ] **Step 2: Create `SectionCard.tsx`**

```typescript
// client/src/pages/settings/system/components/SectionCard.tsx
import { ReactNode } from 'react';
import { StatusBadge } from './StatusBadge';

type Status = 'ok' | 'error' | 'running' | 'disabled';

interface SectionCardProps {
  title: string;
  description: string;
  status?: Status;
  actions?: ReactNode;
  children?: ReactNode;
}

export function SectionCard({ title, description, status, actions, children }: SectionCardProps) {
  return (
    <div className="border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">{title}</h3>
            {status && <StatusBadge status={status} />}
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">{description}</p>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Create `TriggerButton.tsx`**

```typescript
// client/src/pages/settings/system/components/TriggerButton.tsx
import { useState } from 'react';
import { api } from '@/lib/api';
import { notify } from '@/components/ui';
import { Play } from 'lucide-react';

interface TriggerButtonProps {
  endpoint: string;
  label?: string;
  onSuccess?: () => void;
}

export function TriggerButton({ endpoint, label = 'Run Now', onSuccess }: TriggerButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleTrigger() {
    setLoading(true);
    try {
      const res = await api.post(endpoint);
      notify.success(res.data.message ?? 'Triggered successfully');
      onSuccess?.();
    } catch (err: any) {
      notify.error(err.response?.data?.error ?? 'Trigger failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleTrigger}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      <Play size={12} className={loading ? 'animate-spin' : ''} />
      {loading ? 'Running…' : label}
    </button>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/settings/system/components/
git commit -m "feat(system): add shared StatusBadge, SectionCard, TriggerButton components"
```

---

## Task 4: SystemSettingsLayout + index

**Files:**
- Create: `client/src/pages/settings/system/SystemSettingsLayout.tsx`
- Create: `client/src/pages/settings/system/index.tsx`

- [ ] **Step 1: Create `SystemSettingsLayout.tsx`**

```typescript
// client/src/pages/settings/system/SystemSettingsLayout.tsx
import { NavLink, Outlet } from 'react-router-dom';
import { Briefcase, Zap, Plug, Brain } from 'lucide-react';

const navItems = [
  { to: '/settings/system/jobs',         label: 'Cron Jobs',    icon: Briefcase },
  { to: '/settings/system/automation',   label: 'Automation',   icon: Zap },
  { to: '/settings/system/integrations', label: 'Integrations', icon: Plug },
  { to: '/settings/system/ai',           label: 'AI Features',  icon: Brain },
];

export default function SystemSettingsLayout() {
  return (
    <div className="flex gap-6">
      <nav className="w-44 shrink-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3 px-2">System</p>
        <ul className="space-y-0.5">
          {navItems.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-sm)] text-sm transition-colors ${
                    isActive
                      ? 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)] font-medium'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-raised)]'
                  }`
                }
              >
                <Icon size={14} />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex-1 min-w-0 space-y-4">
        <Outlet />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `index.tsx`**

```typescript
// client/src/pages/settings/system/index.tsx
export { default } from './SystemSettingsLayout';
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/settings/system/SystemSettingsLayout.tsx client/src/pages/settings/system/index.tsx
git commit -m "feat(system): add SystemSettingsLayout with sidebar nav"
```

---

## Task 5: JobsPage

**Files:**
- Create: `client/src/pages/settings/system/JobsPage.tsx`

- [ ] **Step 1: Create `JobsPage.tsx`**

```typescript
// client/src/pages/settings/system/JobsPage.tsx
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { TriggerButton } from './components/TriggerButton';
import { StatusBadge } from './components/StatusBadge';

interface Job {
  name: string;
  lastRunAt?: string;
  lastResult?: 'ok' | 'error';
  lastError?: string;
}

function formatDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default function JobsPage() {
  const qc = useQueryClient();
  const { data: jobs = [], isLoading } = useQuery<Job[]>({
    queryKey: ['system', 'jobs'],
    queryFn: () => api.get('/api/v1/cron/jobs').then(r => r.data),
    refetchInterval: 10_000,
  });

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-base font-semibold text-[var(--color-text)]">Cron Jobs</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Background jobs that run on a schedule. Trigger manually or monitor last run status.</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
      ) : (
        <div className="border border-[var(--color-border)] rounded-[var(--radius-md)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
                <th className="text-left px-4 py-2.5 font-medium text-[var(--color-text-muted)] text-xs">Job</th>
                <th className="text-left px-4 py-2.5 font-medium text-[var(--color-text-muted)] text-xs">Last Run</th>
                <th className="text-left px-4 py-2.5 font-medium text-[var(--color-text-muted)] text-xs">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-[var(--color-text-muted)] text-xs">Error</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.name} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-[var(--color-text)]">{job.name}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{formatDate(job.lastRunAt)}</td>
                  <td className="px-4 py-3">
                    {job.lastResult ? (
                      <StatusBadge status={job.lastResult} />
                    ) : (
                      <span className="text-xs text-[var(--color-text-muted)]">Never run</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-red-500 max-w-xs truncate">{job.lastError ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <TriggerButton
                      endpoint={`/api/v1/cron/jobs/${job.name}/trigger`}
                      onSuccess={() => qc.invalidateQueries({ queryKey: ['system', 'jobs'] })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/settings/system/JobsPage.tsx
git commit -m "feat(system): add JobsPage with cron job list and manual trigger"
```

---

## Task 6: AutomationPage

**Files:**
- Create: `client/src/pages/settings/system/AutomationPage.tsx`

- [ ] **Step 1: Create `AutomationPage.tsx`**

```typescript
// client/src/pages/settings/system/AutomationPage.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { notify } from '@/components/ui';
import { SectionCard } from './components/SectionCard';
import { TriggerButton } from './components/TriggerButton';

interface AutomationConfig {
  ruleEngineEnabled: boolean;
  billMatcherEnabled: boolean;
  billMatcherConfidence: number;
  autoCategorizeEnabled: boolean;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </div>
      <span className="text-sm text-[var(--color-text)]">{label}</span>
    </label>
  );
}

export default function AutomationPage() {
  const qc = useQueryClient();

  const { data: config, isLoading } = useQuery<AutomationConfig>({
    queryKey: ['system', 'automation'],
    queryFn: () => api.get('/api/v1/system/automation').then(r => r.data),
  });

  const mutation = useMutation({
    mutationFn: (data: AutomationConfig) => api.put('/api/v1/system/automation', data).then(r => r.data),
    onSuccess: (data) => {
      qc.setQueryData(['system', 'automation'], data);
      notify.success('Automation settings saved');
    },
    onError: (err: any) => notify.error(err.response?.data?.error ?? 'Save failed'),
  });

  function update(patch: Partial<AutomationConfig>) {
    if (!config) return;
    mutation.mutate({ ...config, ...patch });
  }

  if (isLoading || !config) return <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-[var(--color-text)]">Automation</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Configure rule-based automation and transaction processing.</p>
      </div>

      <SectionCard
        title="Rule Engine"
        description="Automatically applies transaction rules on import and on schedule."
        status={config.ruleEngineEnabled ? 'ok' : 'disabled'}
        actions={<TriggerButton endpoint="/api/v1/cron/jobs/rule-execution/trigger" label="Run Now" />}
      >
        <Toggle
          checked={config.ruleEngineEnabled}
          onChange={v => update({ ruleEngineEnabled: v })}
          label="Enable rule engine"
        />
      </SectionCard>

      <SectionCard
        title="Bill Matcher"
        description="Matches recurring transactions to known bills automatically."
        status={config.billMatcherEnabled ? 'ok' : 'disabled'}
      >
        <div className="space-y-3">
          <Toggle
            checked={config.billMatcherEnabled}
            onChange={v => update({ billMatcherEnabled: v })}
            label="Enable bill matcher"
          />
          <div className="flex items-center gap-3">
            <label className="text-xs text-[var(--color-text-muted)] w-36 shrink-0">Confidence threshold</label>
            <input
              type="range"
              min={0}
              max={100}
              value={config.billMatcherConfidence}
              onChange={e => update({ billMatcherConfidence: Number(e.target.value) })}
              onMouseUp={() => mutation.mutate(config)}
              className="flex-1"
            />
            <span className="text-xs font-mono w-8 text-right">{config.billMatcherConfidence}%</span>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Auto-Categorize"
        description="Uses AI to automatically categorize uncategorized transactions."
        status={config.autoCategorizeEnabled ? 'ok' : 'disabled'}
        actions={<TriggerButton endpoint="/api/v1/system/automation/auto-categorize/trigger" label="Run Now" />}
      >
        <Toggle
          checked={config.autoCategorizeEnabled}
          onChange={v => update({ autoCategorizeEnabled: v })}
          label="Enable auto-categorize"
        />
      </SectionCard>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/settings/system/AutomationPage.tsx
git commit -m "feat(system): add AutomationPage with rule engine, bill matcher, auto-categorize controls"
```

---

## Task 7: IntegrationsPage

**Files:**
- Create: `client/src/pages/settings/system/IntegrationsPage.tsx`

- [ ] **Step 1: Create `IntegrationsPage.tsx`**

```typescript
// client/src/pages/settings/system/IntegrationsPage.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { notify } from '@/components/ui';
import { SectionCard } from './components/SectionCard';
import { TriggerButton } from './components/TriggerButton';

interface IntegrationsConfig {
  imapEnabled: boolean;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPass: string;
  digestEnabled: boolean;
  digestSchedule: 'daily' | 'weekly';
  webhooksEnabled: boolean;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </div>
      <span className="text-sm text-[var(--color-text)]">{label}</span>
    </label>
  );
}

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const [imapTestResult, setImapTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [imapTesting, setImapTesting] = useState(false);

  const { data: config, isLoading } = useQuery<IntegrationsConfig>({
    queryKey: ['system', 'integrations'],
    queryFn: () => api.get('/api/v1/system/integrations').then(r => r.data),
  });

  const mutation = useMutation({
    mutationFn: (data: IntegrationsConfig) => api.put('/api/v1/system/integrations', data).then(r => r.data),
    onSuccess: (data) => {
      qc.setQueryData(['system', 'integrations'], data);
      notify.success('Integration settings saved');
    },
    onError: (err: any) => notify.error(err.response?.data?.error ?? 'Save failed'),
  });

  function update(patch: Partial<IntegrationsConfig>) {
    if (!config) return;
    mutation.mutate({ ...config, ...patch });
  }

  async function testImap() {
    if (!config) return;
    setImapTesting(true);
    setImapTestResult(null);
    try {
      await api.post('/api/v1/system/integrations/imap/test', {
        host: config.imapHost,
        port: config.imapPort,
        user: config.imapUser,
        pass: config.imapPass,
      });
      setImapTestResult({ ok: true, message: 'Connection successful' });
    } catch (err: any) {
      setImapTestResult({ ok: false, message: err.response?.data?.error ?? 'Connection failed' });
    } finally {
      setImapTesting(false);
    }
  }

  if (isLoading || !config) return <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-[var(--color-text)]">Integrations</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Configure email ingestion, digest notifications, and webhooks.</p>
      </div>

      <SectionCard
        title="IMAP Email Watcher"
        description="Connects to an email inbox to parse transactions from bank emails."
        status={config.imapEnabled ? 'ok' : 'disabled'}
      >
        <div className="space-y-3">
          <Toggle checked={config.imapEnabled} onChange={v => update({ imapEnabled: v })} label="Enable IMAP watcher" />
          <div className="grid grid-cols-2 gap-3 mt-3">
            {[
              { field: 'imapHost' as const, label: 'Host', placeholder: 'imap.gmail.com' },
              { field: 'imapPort' as const, label: 'Port', placeholder: '993', type: 'number' },
              { field: 'imapUser' as const, label: 'Username', placeholder: 'you@gmail.com' },
              { field: 'imapPass' as const, label: 'Password', placeholder: '••••••••', type: 'password' },
            ].map(({ field, label, placeholder, type = 'text' }) => (
              <div key={field}>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">{label}</label>
                <input
                  type={type}
                  value={String(config[field])}
                  onChange={e => update({ [field]: type === 'number' ? Number(e.target.value) : e.target.value } as Partial<IntegrationsConfig>)}
                  placeholder={placeholder}
                  className="w-full px-2.5 py-1.5 text-sm border border-[var(--color-border)] rounded-[var(--radius-sm)] bg-[var(--color-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={testImap}
              disabled={imapTesting}
              className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] disabled:opacity-50 transition-colors"
            >
              {imapTesting ? 'Testing…' : 'Test Connection'}
            </button>
            {imapTestResult && (
              <span className={`text-xs ${imapTestResult.ok ? 'text-green-600' : 'text-red-500'}`}>
                {imapTestResult.message}
              </span>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Digest Email"
        description="Sends a periodic summary of your finances to your email."
        status={config.digestEnabled ? 'ok' : 'disabled'}
        actions={<TriggerButton endpoint="/api/v1/system/integrations/digest/trigger" label="Send Now" />}
      >
        <div className="space-y-3">
          <Toggle checked={config.digestEnabled} onChange={v => update({ digestEnabled: v })} label="Enable digest email" />
          <div className="flex items-center gap-3">
            <label className="text-xs text-[var(--color-text-muted)]">Schedule</label>
            <select
              value={config.digestSchedule}
              onChange={e => update({ digestSchedule: e.target.value as 'daily' | 'weekly' })}
              className="px-2 py-1 text-sm border border-[var(--color-border)] rounded-[var(--radius-sm)] bg-[var(--color-surface)]"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Webhooks"
        description="Fire HTTP POST requests to external URLs on financial events."
        status={config.webhooksEnabled ? 'ok' : 'disabled'}
      >
        <Toggle checked={config.webhooksEnabled} onChange={v => update({ webhooksEnabled: v })} label="Enable webhooks" />
        <p className="text-xs text-[var(--color-text-muted)] mt-2">
          Manage individual webhook endpoints in <a href="/settings" className="underline">Settings → Webhooks</a>.
        </p>
      </SectionCard>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/settings/system/IntegrationsPage.tsx
git commit -m "feat(system): add IntegrationsPage with IMAP, digest email, and webhook controls"
```

---

## Task 8: AiPage

**Files:**
- Create: `client/src/pages/settings/system/AiPage.tsx`

- [ ] **Step 1: Create `AiPage.tsx`**

```typescript
// client/src/pages/settings/system/AiPage.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { notify } from '@/components/ui';
import { SectionCard } from './components/SectionCard';
import { TriggerButton } from './components/TriggerButton';

interface AiConfig {
  proactiveAiEnabled: boolean;
  proactiveAiFrequency: 'daily' | 'weekly' | 'on_login';
  investmentIntelEnabled: boolean;
  wealthAnalysisEnabled: boolean;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </div>
      <span className="text-sm text-[var(--color-text)]">{label}</span>
    </label>
  );
}

export default function AiPage() {
  const qc = useQueryClient();

  const { data: config, isLoading } = useQuery<AiConfig>({
    queryKey: ['system', 'ai'],
    queryFn: () => api.get('/api/v1/system/ai').then(r => r.data),
  });

  const mutation = useMutation({
    mutationFn: (data: AiConfig) => api.put('/api/v1/system/ai', data).then(r => r.data),
    onSuccess: (data) => {
      qc.setQueryData(['system', 'ai'], data);
      notify.success('AI settings saved');
    },
    onError: (err: any) => notify.error(err.response?.data?.error ?? 'Save failed'),
  });

  function update(patch: Partial<AiConfig>) {
    if (!config) return;
    mutation.mutate({ ...config, ...patch });
  }

  if (isLoading || !config) return <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-[var(--color-text)]">AI Features</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Control AI-powered analysis and insight features.</p>
      </div>

      <SectionCard
        title="Proactive AI"
        description="Analyzes your finances and surfaces insights, anomalies, and recommendations."
        status={config.proactiveAiEnabled ? 'ok' : 'disabled'}
        actions={<TriggerButton endpoint="/api/v1/system/ai/proactive/trigger" label="Run Now" />}
      >
        <div className="space-y-3">
          <Toggle
            checked={config.proactiveAiEnabled}
            onChange={v => update({ proactiveAiEnabled: v })}
            label="Enable proactive AI"
          />
          <div className="flex items-center gap-3">
            <label className="text-xs text-[var(--color-text-muted)]">Check frequency</label>
            <select
              value={config.proactiveAiFrequency}
              onChange={e => update({ proactiveAiFrequency: e.target.value as AiConfig['proactiveAiFrequency'] })}
              className="px-2 py-1 text-sm border border-[var(--color-border)] rounded-[var(--radius-sm)] bg-[var(--color-surface)]"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="on_login">On login</option>
            </select>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Investment Intel"
        description="Fetches market data and analyzes your investment portfolio."
        status={config.investmentIntelEnabled ? 'ok' : 'disabled'}
        actions={<TriggerButton endpoint="/api/v1/system/ai/investment-intel/trigger" label="Refresh Now" />}
      >
        <Toggle
          checked={config.investmentIntelEnabled}
          onChange={v => update({ investmentIntelEnabled: v })}
          label="Enable investment intel"
        />
      </SectionCard>

      <SectionCard
        title="Wealth Analysis"
        description="Calculates comprehensive wealth metrics across all accounts and assets."
        status={config.wealthAnalysisEnabled ? 'ok' : 'disabled'}
        actions={<TriggerButton endpoint="/api/v1/system/ai/wealth/trigger" label="Recalculate" />}
      >
        <Toggle
          checked={config.wealthAnalysisEnabled}
          onChange={v => update({ wealthAnalysisEnabled: v })}
          label="Enable wealth analysis"
        />
      </SectionCard>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/settings/system/AiPage.tsx
git commit -m "feat(system): add AiPage with proactive AI, investment intel, and wealth analysis controls"
```

---

## Task 9: Wire routes in App.tsx + Settings nav link

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/pages/settings/SettingsPage.tsx`

- [ ] **Step 1: Add lazy imports to `App.tsx`**

After the existing lazy imports (around line 31), add:
```typescript
const SystemJobsPage        = lazy(() => import('@/pages/settings/system/JobsPage'));
const SystemAutomationPage  = lazy(() => import('@/pages/settings/system/AutomationPage'));
const SystemIntegrationsPage = lazy(() => import('@/pages/settings/system/IntegrationsPage'));
const SystemAiPage          = lazy(() => import('@/pages/settings/system/AiPage'));
const SystemSettingsLayout  = lazy(() => import('@/pages/settings/system/SystemSettingsLayout'));
```

- [ ] **Step 2: Add routes to `App.tsx`**

Find the existing `/settings/*` route block (around line 251). Add these sibling routes inside the `<Route element={<AuthenticatedLayout />}>` block, before the catch-all `*` route:

```tsx
<Route path="/settings/system" element={<SystemSettingsLayout />}>
  <Route index element={<Navigate to="/settings/system/jobs" replace />} />
  <Route path="jobs"         element={<SystemJobsPage />} />
  <Route path="automation"   element={<SystemAutomationPage />} />
  <Route path="integrations" element={<SystemIntegrationsPage />} />
  <Route path="ai"           element={<SystemAiPage />} />
</Route>
```

- [ ] **Step 3: Add "System" link in SettingsPage nav**

Open `client/src/pages/settings/SettingsPage.tsx`. Find the settings nav section (look for nav links to `/settings/profile` or similar). Add a "System" nav entry pointing to `/settings/system`:

```tsx
<NavLink
  to="/settings/system"
  className={({ isActive }) =>
    `flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] text-sm transition-colors ${
      isActive
        ? 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)] font-medium'
        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-raised)]'
    }`
  }
>
  <Server size={15} />
  System
</NavLink>
```

Add `Server` to the lucide-react import in SettingsPage.tsx.

- [ ] **Step 4: TypeScript check**

```bash
cd client && npx tsc --noEmit
```
Fix any errors before continuing.

- [ ] **Step 5: Commit**

```bash
git add client/src/App.tsx client/src/pages/settings/SettingsPage.tsx
git commit -m "feat(system): wire system settings routes and add nav link in Settings"
```

---

## Task 10: Smoke test

**Files:**
- Modify: `tests/e2e/` (add smoke test step)

- [ ] **Step 1: Verify smoke test checklist in CLAUDE.md**

The smoke test checklist in `CLAUDE.md` includes "Settings page loads". Verify `/settings/system/jobs` loads by running the app and navigating manually, or add to the E2E smoke test file.

- [ ] **Step 2: Check TypeScript and run unit tests**

```bash
cd server && npx vitest run src/routes/system.test.ts
cd client && npx tsc --noEmit
```
Both must pass with zero errors.

- [ ] **Step 3: Start dev server and verify pages load**

```bash
make dev
```

Navigate to:
- `http://localhost:3000/settings/system/jobs` — should show jobs table
- `http://localhost:3000/settings/system/automation` — should show 3 section cards
- `http://localhost:3000/settings/system/integrations` — should show IMAP + digest + webhooks
- `http://localhost:3000/settings/system/ai` — should show 3 AI section cards

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: system settings page complete — jobs, automation, integrations, ai"
```
