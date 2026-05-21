import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { createModuleLogger } from './logger.js';
const log = createModuleLogger('audit');

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';
export type AuditEntity = 'TRANSACTION' | 'ACCOUNT' | 'BUDGET' | 'GOAL' | 'RULE' | 'RULE_GROUP' | 'RECURRING' | 'BILL';

interface AuditParams {
  householdId: string;
  userId: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

function toAuditJson(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(toAuditJson);
  }

  if (typeof value === 'object') {
    if ('toJSON' in value && typeof value.toJSON === 'function') {
      return toAuditJson(value.toJSON());
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, toAuditJson(item)]),
    );
  }

  return String(value);
}

function buildAuditChanges(params: AuditParams): Prisma.InputJsonValue | undefined {
  if (!params.before && !params.after) {
    return undefined;
  }

  return {
    before: toAuditJson(params.before),
    after: toAuditJson(params.after),
  };
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
        changes: buildAuditChanges(params),
      },
    })
    .catch((err) => log.error({ err }, 'Failed to write audit log'));
}
