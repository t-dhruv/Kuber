/**
 * importDedup.ts
 * SHA256 deduplication for imported transactions.
 * Hash key: date + normalizedDescription + |amount|
 */

import crypto from 'crypto';

/**
 * Normalize a transaction description for consistent hashing.
 * Lowercases, strips extra whitespace, removes trailing reference numbers.
 */
export function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*(#|ref|no\.?|id)\s*[a-z0-9-]+$/i, '') // strip trailing refs
    .trim();
}

/**
 * Compute a dedup hash for a transaction.
 * Two transactions with the same date, normalized description, and absolute amount
 * will produce the same hash.
 */
export function computeDedupHash(date: string, description: string, amount: number): string {
  const normalized = [
    date.trim(),
    normalizeDescription(description),
    Math.abs(amount).toFixed(2),
  ].join('|');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Given a set of dedup hashes from an import batch and the existing hashes
 * already in the database, return which rows are duplicates.
 */
export function markDuplicates(
  rows: Array<{ hash: string; [key: string]: unknown }>,
  existingHashes: Set<string>
): Array<{ hash: string; isDuplicate: boolean; [key: string]: unknown }> {
  const seenInBatch = new Set<string>();
  return rows.map((row) => {
    const isDuplicate = existingHashes.has(row.hash) || seenInBatch.has(row.hash);
    seenInBatch.add(row.hash);
    return { ...row, isDuplicate };
  });
}
