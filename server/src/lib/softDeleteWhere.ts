/**
 * Helper to add isDeleted = false filter to where clauses
 * Financial records must not be hard-deleted, only soft-deleted
 */

export const NOT_DELETED = { isDeleted: false };

export type WhereClause = Record<string, unknown>;

export function addNotDeletedFilter<TWhere extends WhereClause>(where: TWhere): TWhere & typeof NOT_DELETED {
  return { ...where, isDeleted: false };
}

export function addNotDeletedToAnd<TWhere extends WhereClause>(where: TWhere): TWhere & { isDeleted?: false; AND?: unknown[] } {
  if (where.AND) {
    return {
      ...where,
      AND: Array.isArray(where.AND)
        ? [...where.AND, NOT_DELETED]
        : [where.AND, NOT_DELETED],
    };
  }
  return { ...where, isDeleted: false };
}
