/**
 * Helper to add isDeleted = false filter to where clauses
 * Financial records must not be hard-deleted, only soft-deleted
 */

export const NOT_DELETED = { isDeleted: false };

export function addNotDeletedFilter(where: Record<string, any>): Record<string, any> {
  return { ...where, isDeleted: false };
}

export function addNotDeletedToAnd(where: Record<string, any>): Record<string, any> {
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
