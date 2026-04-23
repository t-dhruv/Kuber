import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../lib/audit';
import { createCheckpoint } from '../lib/checkpoint.js';
import {
  applyActionsToTransaction,
  ruleMatches,
  type RuleAction as Action,
  type RuleCondition as Condition,
} from '../lib/ruleEngine';

const router = Router();

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const conditionSchema = z.object({
  field: z.enum(['merchantName', 'description', 'amount']),
  operator: z.enum(['contains', 'equals', 'startsWith', 'endsWith', 'gt', 'lt', 'gte', 'lte']),
  value: z.union([z.string(), z.number()]),
});

const actionSchema = z.object({
  type: z.enum(['setCategory', 'addTag', 'hide', 'markReviewed']),
  value: z.string().optional(), // categoryId or tagId
});

const ruleBodySchema = z.object({
  conditions: z.array(conditionSchema).min(1),
  actions: z.array(actionSchema).min(1),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── GET /api/v1/rules ────────────────────────────────────────────────────────

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const rules = await prisma.rule.findMany({
      where: { householdId: req.householdId! },
      orderBy: { sortOrder: 'asc' },
    });
    return res.json(rules);
  } catch (err) {
    req.log.error({ err }, 'rules/list');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/v1/rules ───────────────────────────────────────────────────────

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = ruleBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const maxOrder = await prisma.rule.aggregate({
      where: { householdId: req.householdId! },
      _max: { sortOrder: true },
    });

    const rule = await prisma.rule.create({
      data: {
        householdId: req.householdId!,
        conditions: parsed.data.conditions,
        actions: parsed.data.actions,
        isActive: parsed.data.isActive,
        sortOrder: parsed.data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
      },
    });

    logAudit({ householdId: req.householdId!, userId: req.userId!, action: 'CREATE', entity: 'RULE', entityId: rule.id, after: rule as any });
    return res.status(201).json(rule);
  } catch (err) {
    req.log.error({ err }, 'rules/create');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /api/v1/rules/:id ────────────────────────────────────────────────────

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.rule.findFirst({
      where: { id: req.params.id, householdId: req.householdId! },
    });
    if (!existing) return res.status(404).json({ error: 'Rule not found' });

    const parsed = ruleBodySchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const rule = await prisma.rule.update({
      where: { id: req.params.id },
      data: {
        ...(parsed.data.conditions && { conditions: parsed.data.conditions }),
        ...(parsed.data.actions && { actions: parsed.data.actions }),
        ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
        ...(parsed.data.sortOrder !== undefined && { sortOrder: parsed.data.sortOrder }),
      },
    });

    logAudit({ householdId: req.householdId!, userId: req.userId!, action: 'UPDATE', entity: 'RULE', entityId: rule.id, before: existing as any, after: rule as any });
    return res.json(rule);
  } catch (err) {
    req.log.error({ err }, 'rules/update');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /api/v1/rules/:id ─────────────────────────────────────────────────

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.rule.findFirst({
      where: { id: req.params.id, householdId: req.householdId! },
    });
    if (!existing) return res.status(404).json({ error: 'Rule not found' });

    await prisma.rule.delete({ where: { id: req.params.id } });
    logAudit({ householdId: req.householdId!, userId: req.userId!, action: 'DELETE', entity: 'RULE', entityId: req.params.id, before: existing as any });
    return res.json({ message: 'Rule deleted' });
  } catch (err) {
    req.log.error({ err }, 'rules/delete');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /api/v1/rules/reorder ────────────────────────────────────────────────

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

// ─── POST /api/v1/rules/:id/apply ────────────────────────────────────────────

router.post('/:id/apply', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const rule = await prisma.rule.findFirst({
      where: { id: req.params.id, householdId },
    });
    if (!rule) return res.status(404).json({ error: 'Rule not found' });

    const conditions = rule.conditions as Condition[];
    const actions = rule.actions as Action[];

    const transactions = await prisma.transaction.findMany({
      where: { householdId, isHidden: false },
      include: { merchant: { select: { displayName: true, name: true } } },
    });

    // Snapshot affected transactions before mutating
    const affectedIds = transactions
      .filter((tx) => {
        const merchantName = tx.merchant?.displayName ?? tx.merchant?.name ?? tx.description;
        return ruleMatches(conditions, { description: tx.description, merchantName, amount: tx.amount });
      })
      .map((tx) => tx.id);

    const checkpointId = await createCheckpoint(
      prisma,
      householdId,
      'rule-apply-all',
      `Rule applied to ${affectedIds.length} transaction${affectedIds.length !== 1 ? 's' : ''}`,
      affectedIds,
    );

    let matched = 0;
    for (const tx of transactions) {
      const merchantName = tx.merchant?.displayName ?? tx.merchant?.name ?? tx.description;
      if (ruleMatches(conditions, { description: tx.description, merchantName, amount: tx.amount })) {
        await applyActionsToTransaction(prisma, tx.id, actions, householdId);
        matched++;
      }
    }

    return res.json({ matched, checkpointId, message: `Rule applied to ${matched} transaction(s)` });
  } catch (err) {
    req.log.error({ err }, 'rules/apply');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/v1/rules/apply-all ────────────────────────────────────────────

router.post('/apply-all', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    const rules = await prisma.rule.findMany({
      where: { householdId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    const transactions = await prisma.transaction.findMany({
      where: { householdId, isHidden: false },
      include: { merchant: { select: { displayName: true, name: true } } },
    });

    // Determine which transactions will be affected before mutating
    const affectedIds: string[] = [];
    for (const rule of rules) {
      const conditions = rule.conditions as Condition[];
      for (const tx of transactions) {
        const merchantName = tx.merchant?.displayName ?? tx.merchant?.name ?? tx.description;
        if (ruleMatches(conditions, { description: tx.description, merchantName, amount: tx.amount })) {
          if (!affectedIds.includes(tx.id)) affectedIds.push(tx.id);
        }
      }
    }

    // Snapshot affected transactions before any mutations
    const checkpointId = await createCheckpoint(
      prisma,
      householdId,
      'rule-apply-all',
      `Rule run — ${rules.length} rule${rules.length !== 1 ? 's' : ''} across ${affectedIds.length} transaction${affectedIds.length !== 1 ? 's' : ''}`,
      affectedIds,
    );

    let totalMatched = 0;
    for (const rule of rules) {
      const conditions = rule.conditions as Condition[];
      const actions = rule.actions as Action[];
      for (const tx of transactions) {
        const merchantName = tx.merchant?.displayName ?? tx.merchant?.name ?? tx.description;
        if (ruleMatches(conditions, { description: tx.description, merchantName, amount: tx.amount })) {
          await applyActionsToTransaction(prisma, tx.id, actions, householdId);
          totalMatched++;
        }
      }
    }

    return res.json({ matched: totalMatched, rulesRun: rules.length, checkpointId });
  } catch (err) {
    req.log.error({ err }, 'rules/apply-all');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
