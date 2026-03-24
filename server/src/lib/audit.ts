import { prisma } from './prisma';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';
export type AuditEntity = 'TRANSACTION' | 'ACCOUNT' | 'BUDGET' | 'GOAL' | 'RULE' | 'RECURRING';

interface AuditParams {
  householdId: string;
  userId: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

// Fire-and-forget — never throws, never blocks
export function logAudit(params: AuditParams): void {
  prisma.auditLog
    .create({
      data: {
        householdId: params.householdId,
        userId: params.userId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        changes: params.before || params.after
          ? ({ before: params.before ?? null, after: params.after ?? null } as any)
          : undefined,
      },
    })
    .catch((err) => console.error('[audit] Failed to write log:', err));
}
