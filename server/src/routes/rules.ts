import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../lib/audit';
import {
  applyActionsToJournal,
  normalizeRuleActions,
  normalizeRuleTriggers,
  ruleMatchesMode,
  type NormalizedRuleAction,
  type NormalizedRuleTrigger,
  type RuleMatchInput,
} from '../lib/ruleEngine';
import { buildRuleMatchInputFromJournal } from '../lib/transactionJournalService';

const router = Router();

const triggerFieldSchema = z.enum(['merchantName', 'description', 'amount', 'categoryId', 'accountId', 'notes']);
const triggerOperatorSchema = z.enum(['contains', 'notContains', 'startsWith', 'endsWith', 'equals', 'notEquals', 'gt', 'gte', 'lt', 'lte']);

const triggerSchema = z.object({
  field: triggerFieldSchema,
  operator: triggerOperatorSchema,
  value: z.union([z.string(), z.number()]),
  sortOrder: z.number().int().optional(),
});

const actionSchema = z.object({
  type: z.enum([
    'setCategory',
    'clearCategory',
    'addTag',
    'removeTag',
    'hide',
    'unhide',
    'markReviewed',
    'flagForReview',
    'setDescription',
    'setNotes',
    'appendNotes',
    'setSourceAccount',
    'setDestinationAccount',
  ]),
  value: z.string().optional(),
  sortOrder: z.number().int().optional(),
  stopProcessing: z.boolean().optional().default(false),
});

const ruleBodyBaseSchema = z.object({
  name: z.string().optional(),
  conditions: z.array(triggerSchema).optional(),
  triggers: z.array(triggerSchema).optional(),
  actions: z.array(actionSchema).optional(),
  ruleActions: z.array(actionSchema).optional(),
  strict: z.boolean().optional().default(true),
  stopProcessing: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional(),
  ruleGroupId: z.string().nullable().optional(),
});

const ruleBodySchema = ruleBodyBaseSchema.refine((body) => (body.conditions?.length ?? body.triggers?.length ?? 0) > 0, {
  message: 'At least one trigger is required',
}).refine((body) => (body.actions?.length ?? body.ruleActions?.length ?? 0) > 0, {
  message: 'At least one action is required',
});

const partialRuleBodySchema = ruleBodyBaseSchema.partial().refine((body) => {
  const triggers = body.triggers ?? body.conditions;
  const actions = body.ruleActions ?? body.actions;
  if (triggers !== undefined && triggers.length === 0) return false;
  if (actions !== undefined && actions.length === 0) return false;
  return true;
}, { message: 'Trigger/action arrays cannot be empty' });

const testBodySchema = z.object({
  journalId: z.string().optional(),
  matchInput: z.object({
    merchantName: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    amount: z.number().nullable().optional(),
    categoryId: z.string().nullable().optional(),
    accountId: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  }).optional(),
}).refine((body) => body.journalId || body.matchInput, {
  message: 'journalId or matchInput is required',
});

type RuleWithNormalizedRows = {
  id: string;
  conditions: unknown;
  actions: unknown;
  strict?: boolean | null;
  triggers?: unknown;
  ruleActions?: unknown;
  [key: string]: unknown;
};

function sanitizeTrigger(input: { field?: string; operator?: string; value?: string | number; sortOrder?: number }) {
  return {
    ...input,
    field: input.field === 'merchant' ? 'merchantName' : input.field,
  };
}

function valueToString(value: string | number) {
  return typeof value === 'number' ? String(value) : value;
}

function asLegacyTrigger(trigger: NormalizedRuleTrigger) {
  return {
    field: trigger.field,
    operator: trigger.operator,
    value: trigger.value,
  };
}

function asPublicTrigger(trigger: NormalizedRuleTrigger) {
  return {
    field: trigger.field,
    operator: trigger.operator,
    value: trigger.value,
    sortOrder: trigger.sortOrder,
  };
}

function asLegacyAction(action: NormalizedRuleAction) {
  return action.value === undefined
    ? { type: action.type }
    : { type: action.type, value: action.value };
}

function asPublicAction(action: NormalizedRuleAction) {
  return {
    type: action.type,
    value: action.value,
    sortOrder: action.sortOrder,
    stopProcessing: action.stopProcessing ?? false,
  };
}

function titleCase(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function triggerLabel(trigger: Pick<NormalizedRuleTrigger, 'field' | 'operator' | 'value'>) {
  const fieldLabels: Record<string, string> = {
    merchantName: 'Merchant name',
    categoryId: 'Category',
    accountId: 'Account',
  };
  const operatorLabels: Record<string, string> = {
    notContains: 'does not contain',
    startsWith: 'starts with',
    endsWith: 'ends with',
    notEquals: 'does not equal',
    gt: 'is greater than',
    gte: 'is at least',
    lt: 'is less than',
    lte: 'is at most',
  };
  const field = fieldLabels[trigger.field] ?? titleCase(trigger.field);
  const operator = operatorLabels[trigger.operator] ?? trigger.operator;
  return `${field} ${operator} "${trigger.value}"`;
}

function actionName(action: Pick<NormalizedRuleAction, 'type'>) {
  const labels: Record<string, string> = {
    setCategory: 'Set category',
    clearCategory: 'Clear category',
    addTag: 'Add tag',
    removeTag: 'Remove tag',
    hide: 'Hide transaction',
    unhide: 'Unhide transaction',
    markReviewed: 'Mark as reviewed',
    flagForReview: 'Flag for review',
    setDescription: 'Set description',
    setNotes: 'Set notes',
    appendNotes: 'Append notes',
    setSourceAccount: 'Set source account',
    setDestinationAccount: 'Set destination account',
  };
  return labels[action.type] ?? titleCase(action.type);
}

function generateRuleName(triggers: Pick<NormalizedRuleTrigger, 'field' | 'operator' | 'value'>[], actions: Pick<NormalizedRuleAction, 'type'>[]) {
  const trigger = triggers[0];
  const action = actions[0];
  if (!trigger && !action) return 'Untitled rule';
  if (!trigger) return actionName(action);
  if (!action) return triggerLabel(trigger);
  return `${triggerLabel(trigger)} -> ${actionName(action)}`;
}

function formatRule(rule: RuleWithNormalizedRows) {
  const triggers = normalizeRuleTriggers(rule);
  const ruleActions = normalizeRuleActions(rule);

  return {
    ...rule,
    name: typeof rule.name === 'string' && rule.name.trim()
      ? rule.name
      : generateRuleName(triggers, ruleActions),
    triggers: triggers.map(asPublicTrigger),
    ruleActions: ruleActions.map(asPublicAction),
    conditions: Array.isArray(rule.conditions) && (rule.conditions as unknown[]).length > 0
      ? rule.conditions
      : triggers.map(asLegacyTrigger),
    actions: Array.isArray(rule.actions) && (rule.actions as unknown[]).length > 0
      ? rule.actions
      : ruleActions.map(asLegacyAction),
  };
}

function buildRuleWriteData(parsed: z.infer<typeof ruleBodySchema> | z.infer<typeof partialRuleBodySchema>, householdId: string, sortOrder?: number) {
  const triggers = (parsed.triggers ?? parsed.conditions ?? []).map((trigger, index) => ({
    field: trigger.field,
    operator: trigger.operator,
    value: valueToString(trigger.value),
    sortOrder: trigger.sortOrder ?? index + 1,
  }));
  const ruleActions = (parsed.ruleActions ?? parsed.actions ?? []).map((action, index) => ({
    type: action.type,
    value: action.value,
    sortOrder: action.sortOrder ?? index + 1,
    stopProcessing: action.stopProcessing ?? false,
  }));

  return {
    ...(sortOrder !== undefined ? { sortOrder } : {}),
    name: parsed.name?.trim() || generateRuleName(triggers, ruleActions),
    ...(parsed.strict !== undefined ? { strict: parsed.strict } : {}),
    ...(parsed.stopProcessing !== undefined ? { stopProcessing: parsed.stopProcessing } : {}),
    ...(parsed.isActive !== undefined ? { isActive: parsed.isActive } : {}),
    ...(parsed.ruleGroupId !== undefined ? { ruleGroupId: parsed.ruleGroupId } : {}),
    ...(triggers.length > 0 ? {
      conditions: triggers.map(({ field, operator, value }) => ({ field, operator, value })),
      triggers: { create: triggers },
    } : {}),
    ...(ruleActions.length > 0 ? {
      actions: ruleActions.map(({ type, value }) => value === undefined ? { type } : { type, value }),
      ruleActions: { create: ruleActions },
    } : {}),
    householdId,
  };
}

const JOURNAL_INCLUDE = {
  entries: true,
  tags: { include: { tag: true } },
  meta: true,
  category: true,
};

async function getRule(ruleId: string, householdId: string) {
  return prisma.rule.findFirst({
    where: { id: ruleId, householdId },
    include: { triggers: true, ruleActions: true },
  });
}

async function getMatchInputFromTestBody(body: z.infer<typeof testBodySchema>, householdId: string): Promise<RuleMatchInput> {
  if (body.matchInput) return body.matchInput;

  const journal = await prisma.transactionJournal.findFirst({
    where: { id: body.journalId!, householdId, isDeleted: false },
    include: JOURNAL_INCLUDE,
  });
  if (!journal) throw new Error('Transaction journal not found');

  return buildRuleMatchInputFromJournal(journal);
}

async function listJournalRuleCandidates(householdId: string) {
  return prisma.transactionJournal.findMany({
    where: { householdId, isDeleted: false },
    include: JOURNAL_INCLUDE,
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });
}

router.get('/execution-logs', async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const logs = await prisma.ruleExecutionLog.findMany({
      where: { householdId: req.householdId! },
      include: {
        rule: { select: { id: true, name: true } },
        journal: { select: { id: true, description: true, date: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return res.json({
      items: logs.map((log: any) => ({
        id: log.id,
        householdId: log.householdId,
        ruleId: log.ruleId,
        ruleName: log.rule?.name ?? null,
        journalId: log.journalId,
        journalDescription: log.journal?.description ?? null,
        journalDate: log.journal?.date?.toISOString?.() ?? null,
        status: log.status,
        actionsApplied: log.actionsApplied,
        message: log.message,
        createdAt: log.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error({ err }, 'rules/executionLogs');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const rules = await prisma.rule.findMany({
      where: { householdId: req.householdId! },
      include: { triggers: true, ruleActions: true },
      orderBy: { sortOrder: 'asc' },
    });
    return res.json(rules.map(formatRule));
  } catch (err) {
    req.log.error({ err }, 'rules/list');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const body = { ...req.body };
    if (body.conditions) body.conditions = body.conditions.map(sanitizeTrigger);
    if (body.triggers) body.triggers = body.triggers.map(sanitizeTrigger);

    const parsed = ruleBodySchema.safeParse(body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const maxOrder = await prisma.rule.aggregate({
      where: { householdId: req.householdId! },
      _max: { sortOrder: true },
    });

    const rule = await prisma.rule.create({
      data: buildRuleWriteData(
        parsed.data,
        req.householdId!,
        parsed.data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
      ) as any,
      include: { triggers: true, ruleActions: true },
    });

    logAudit({ householdId: req.householdId!, userId: req.userId!, action: 'CREATE', entity: 'RULE', entityId: rule.id, after: rule as any });
    return res.status(201).json(formatRule(rule));
  } catch (err) {
    req.log.error({ err }, 'rules/create');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/reorder', async (req: AuthRequest, res: Response) => {
  try {
    const { order } = req.body as { order: { id: string; sortOrder: number }[] };
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });

    await prisma.$transaction(
      order.map(({ id, sortOrder }) =>
        prisma.rule.updateMany({
          where: { id, householdId: req.householdId! },
          data: { sortOrder },
        }),
      ),
    );

    return res.json({ message: 'Rules reordered' });
  } catch (err) {
    req.log.error({ err }, 'rules/reorder');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await getRule(req.params.id, req.householdId!);
    if (!existing) return res.status(404).json({ error: 'Rule not found' });

    const body = { ...req.body };
    if (body.conditions) body.conditions = body.conditions.map(sanitizeTrigger);
    if (body.triggers) body.triggers = body.triggers.map(sanitizeTrigger);

    const parsed = partialRuleBodySchema.safeParse(body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const hasTriggers = parsed.data.conditions !== undefined || parsed.data.triggers !== undefined;
    const hasActions = parsed.data.actions !== undefined || parsed.data.ruleActions !== undefined;
    const data = buildRuleWriteData(parsed.data, req.householdId!);
    delete (data as any).householdId;

    const rule = await prisma.$transaction(async (tx: any) => {
      if (hasTriggers) await tx.ruleTrigger.deleteMany({ where: { ruleId: req.params.id } });
      if (hasActions) await tx.ruleActionRecord.deleteMany({ where: { ruleId: req.params.id } });
      return tx.rule.update({
        where: { id: req.params.id },
        data: data as any,
        include: { triggers: true, ruleActions: true },
      });
    });

    logAudit({ householdId: req.householdId!, userId: req.userId!, action: 'UPDATE', entity: 'RULE', entityId: rule.id, before: existing as any, after: rule as any });
    return res.json(formatRule(rule));
  } catch (err) {
    req.log.error({ err }, 'rules/update');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await getRule(req.params.id, req.householdId!);
    if (!existing) return res.status(404).json({ error: 'Rule not found' });

    await prisma.rule.delete({ where: { id: req.params.id } });
    logAudit({ householdId: req.householdId!, userId: req.userId!, action: 'DELETE', entity: 'RULE', entityId: req.params.id, before: existing as any });
    return res.json({ message: 'Rule deleted' });
  } catch (err) {
    req.log.error({ err }, 'rules/delete');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/test', async (req: AuthRequest, res: Response) => {
  try {
    const rule = await getRule(req.params.id, req.householdId!);
    if (!rule) return res.status(404).json({ error: 'Rule not found' });

    const parsed = testBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    let matchInput: RuleMatchInput;
    try {
      matchInput = await getMatchInputFromTestBody(parsed.data, req.householdId!);
    } catch (err: any) {
      return res.status(404).json({ error: err.message });
    }

    const triggers = normalizeRuleTriggers(rule);
    const actions = normalizeRuleActions(rule);
    return res.json({
      ruleId: rule.id,
      matched: ruleMatchesMode(triggers, matchInput, rule.strict ?? true),
      actions: actions.map(asPublicAction),
    });
  } catch (err) {
    req.log.error({ err }, 'rules/test');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/apply', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const rule = await getRule(req.params.id, householdId);
    if (!rule) return res.status(404).json({ error: 'Rule not found' });

    const triggers = normalizeRuleTriggers(rule);
    const actions = normalizeRuleActions(rule);
    const journals = await listJournalRuleCandidates(householdId);
    const journalsMatched: string[] = [];

    for (const journal of journals) {
      const matchInput = buildRuleMatchInputFromJournal(journal);
      if (!ruleMatchesMode(triggers, matchInput, rule.strict ?? true)) continue;

      await applyActionsToJournal(prisma, {
        journalId: journal.id,
        householdId,
        ruleId: rule.id,
        actions,
      });
      journalsMatched.push(journal.id);
      if (rule.stopProcessing) break;
    }

    return res.json({
      matched: journalsMatched.length,
      journalsMatched,
      checkpointId: '',
      message: `Rule applied to ${journalsMatched.length} journal(s)`,
    });
  } catch (err) {
    req.log.error({ err }, 'rules/apply');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/apply-all', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const groups = await prisma.ruleGroup.findMany({
      where: { householdId, isActive: true },
      include: {
        rules: {
          where: { isActive: true },
          include: { triggers: true, ruleActions: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
    const journals = await listJournalRuleCandidates(householdId);
    let totalMatched = 0;
    const firedRules = new Set<string>();

    for (const journal of journals) {
      const matchInput = buildRuleMatchInputFromJournal(journal);
      for (const group of groups) {
        let groupFired = false;
        for (const rule of group.rules) {
          const triggers = normalizeRuleTriggers(rule);
          if (!ruleMatchesMode(triggers, matchInput, rule.strict ?? true)) continue;

          await applyActionsToJournal(prisma, {
            journalId: journal.id,
            householdId,
            ruleId: rule.id,
            actions: normalizeRuleActions(rule),
          });
          totalMatched++;
          firedRules.add(rule.id);
          groupFired = true;
          if (rule.stopProcessing) break;
        }
        if (groupFired && group.stopProcessing) break;
      }
    }

    return res.json({ matched: totalMatched, rulesRun: firedRules.size, checkpointId: '' });
  } catch (err) {
    req.log.error({ err }, 'rules/apply-all');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const groupBodySchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().optional(),
  stopProcessing: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
});

router.get('/groups', async (req: AuthRequest, res: Response) => {
  try {
    const groups = await prisma.ruleGroup.findMany({
      where: { householdId: req.householdId! },
      include: { rules: { include: { triggers: true, ruleActions: true }, orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
    return res.json(groups.map((group: any) => ({
      ...group,
      rules: group.rules.map(formatRule),
    })));
  } catch (err) {
    req.log.error({ err }, 'ruleGroups/list');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/groups', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = groupBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const maxOrder = await prisma.ruleGroup.aggregate({
      where: { householdId: req.householdId! },
      _max: { sortOrder: true },
    });

    const group = await prisma.ruleGroup.create({
      data: {
        householdId: req.householdId!,
        name: parsed.data.name,
        stopProcessing: parsed.data.stopProcessing,
        isActive: parsed.data.isActive,
        sortOrder: parsed.data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
      },
    });
    logAudit({ householdId: req.householdId!, userId: req.userId!, action: 'CREATE', entity: 'RULE_GROUP', entityId: group.id, after: group as any });
    return res.status(201).json(group);
  } catch (err) {
    req.log.error({ err }, 'ruleGroups/create');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/groups/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.ruleGroup.findFirst({
      where: { id: req.params.id, householdId: req.householdId! },
    });
    if (!existing) return res.status(404).json({ error: 'Rule group not found' });

    const parsed = groupBodySchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const group = await prisma.ruleGroup.update({
      where: { id: req.params.id },
      data: parsed.data,
    });
    return res.json(group);
  } catch (err) {
    req.log.error({ err }, 'ruleGroups/update');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/groups/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.ruleGroup.findFirst({
      where: { id: req.params.id, householdId: req.householdId! },
    });
    if (!existing) return res.status(404).json({ error: 'Rule group not found' });

    await prisma.rule.updateMany({
      where: { ruleGroupId: req.params.id },
      data: { ruleGroupId: null },
    });
    await prisma.ruleGroup.delete({ where: { id: req.params.id } });
    return res.json({ message: 'Deleted' });
  } catch (err) {
    req.log.error({ err }, 'ruleGroups/delete');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
