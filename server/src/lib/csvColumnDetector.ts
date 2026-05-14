/**
 * csvColumnDetector.ts
 * Fuzzy column header detection for unknown CSV formats.
 * Uses Levenshtein distance + alias dictionaries to map arbitrary headers
 * to Kuber's standard transaction fields.
 */

export type StandardField = 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'balance' | 'category' | 'reference';

export interface ColumnMapping {
  field: StandardField;
  csvHeader: string;
  confidence: number; // 0–1
}

export interface DetectionResult {
  mappings: ColumnMapping[];
  /** Headers that could not be mapped to any standard field */
  unmapped: string[];
  /** Whether separate debit/credit columns were found (vs single amount) */
  amountStrategy: 'single' | 'debit-credit';
}

// ── Alias dictionary ─────────────────────────────────────────────────────────

const ALIASES: Record<StandardField, string[]> = {
  date: [
    'date', 'transaction date', 'trans date', 'posted date', 'posting date',
    'value date', 'settlement date', 'settle date', 'trade date', 'effective date',
    'booking date', 'process date', 'entry date', 'txn date', 'trx date',
  ],
  description: [
    'description', 'desc', 'narration', 'memo', 'details', 'particulars',
    'payee', 'merchant', 'narrative', 'transaction description', 'transaction details',
    'reference', 'remarks', 'note', 'notes', 'text', 'transaction narrative',
    'activity', 'transaction type', 'type', 'name',
  ],
  amount: [
    'amount', 'transaction amount', 'txn amount', 'trx amount', 'net amount',
    'net cash amount', 'value', 'sum', 'total', 'money', 'price', 'proceeds',
  ],
  debit: [
    'debit', 'debit amount', 'withdrawal', 'withdrawals', 'dr', 'money out',
    'out', 'charge', 'payment', 'spend', 'spent',
  ],
  credit: [
    'credit', 'credit amount', 'deposit', 'deposits', 'cr', 'money in',
    'in', 'received', 'income',
  ],
  balance: [
    'balance', 'running balance', 'closing balance', 'available balance',
    'ledger balance', 'account balance', 'bal',
  ],
  category: [
    'category', 'categories', 'cat', 'type', 'transaction type', 'txn type',
    'expense type', 'tag', 'tags',
  ],
  reference: [
    'reference', 'reference number', 'ref', 'ref no', 'ref number', 'transaction id',
    'txn id', 'trx id', 'transaction reference', 'check number', 'cheque number',
    'confirmation', 'confirmation number', 'id',
  ],
};

// ── Levenshtein distance ─────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Score how well a CSV header matches a candidate alias.
 * Returns 0–1 (1 = exact match).
 */
function scoreMatch(header: string, alias: string): number {
  const h = header.toLowerCase().trim().replace(/_/g, ' ');
  const a = alias.toLowerCase().trim().replace(/_/g, ' ');

  // Exact match
  if (h === a) return 1.0;

  // Contains match (header contains alias or vice versa)
  if (h.includes(a) || a.includes(h)) return 0.85;

  // Levenshtein similarity
  const maxLen = Math.max(h.length, a.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshtein(h, a);
  const similarity = 1 - dist / maxLen;

  // Only return meaningful similarity scores
  return similarity >= 0.6 ? similarity * 0.75 : 0;
}

/**
 * Find the best matching standard field for a given CSV header.
 * Returns null if confidence is below threshold.
 */
function detectField(header: string): { field: StandardField; confidence: number } | null {
  let bestField: StandardField | null = null;
  let bestScore = 0;

  for (const [field, aliases] of Object.entries(ALIASES) as [StandardField, string[]][]) {
    for (const alias of aliases) {
      const score = scoreMatch(header, alias);
      if (score > bestScore) {
        bestScore = score;
        bestField = field;
      }
    }
  }

  if (!bestField || bestScore < 0.5) return null;
  return { field: bestField, confidence: Math.round(bestScore * 100) / 100 };
}

/**
 * Detect column mappings for an arbitrary CSV.
 *
 * @param headers - CSV header row
 * @returns DetectionResult with per-column mappings and unmapped headers
 */
export function detectColumnMapping(headers: string[]): DetectionResult {
  const mappings: ColumnMapping[] = [];
  const unmapped: string[] = [];
  const usedFields = new Set<StandardField>();

  for (const header of headers) {
    const match = detectField(header);
    if (!match) {
      unmapped.push(header);
      continue;
    }

    // If a field is already claimed by a higher-confidence mapping, skip
    const existing = mappings.find((m) => m.field === match.field);
    if (existing) {
      if (match.confidence > existing.confidence) {
        // Replace with better match, put old one back as unmapped
        unmapped.push(existing.csvHeader);
        const idx = mappings.indexOf(existing);
        mappings.splice(idx, 1);
      } else {
        unmapped.push(header);
        continue;
      }
    }

    mappings.push({ field: match.field, csvHeader: header, confidence: match.confidence });
    usedFields.add(match.field);
  }

  // Determine amount strategy
  const hasDebit = usedFields.has('debit');
  const hasCredit = usedFields.has('credit');
  const hasAmount = usedFields.has('amount');
  const amountStrategy: 'single' | 'debit-credit' =
    (hasDebit || hasCredit) && !hasAmount ? 'debit-credit' : 'single';

  return { mappings, unmapped, amountStrategy };
}
