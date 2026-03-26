/**
 * bankFormats.ts
 * Bank format registry — maps CSV column headers to standard transaction fields.
 * Auto-detection scores each format against uploaded CSV headers.
 */

export interface BankFormat {
  id: string;
  name: string;
  country: 'CA' | 'US' | 'INTL';
  /** Column header patterns (lowercase) mapped to standard fields */
  mapping: {
    date: string[];
    description: string[];
    amount?: string[];       // single amount column (positive = credit, negative = debit)
    debit?: string[];        // separate debit column (positive = money out)
    credit?: string[];       // separate credit column (positive = money in)
    balance?: string[];
    category?: string[];
    reference?: string[];
  };
  /** Which amount strategy to use */
  amountStrategy: 'single' | 'debit-credit';
  /** For debit-credit strategy: sign convention for debits */
  debitSign: 'negative' | 'positive';
  /** Date format hint */
  dateFormat?: string;
  /** Optional: skip first N rows (for banks with extra header rows) */
  skipRows?: number;
}

export const BANK_FORMATS: BankFormat[] = [
  // ── Canada ──────────────────────────────────────────────────────────────────
  {
    id: 'td-canada',
    name: 'TD Canada Trust',
    country: 'CA',
    mapping: {
      date: ['date'],
      description: ['description'],
      debit: ['debit'],
      credit: ['credit'],
      balance: ['balance'],
    },
    amountStrategy: 'debit-credit',
    debitSign: 'negative',
  },
  {
    id: 'rbc-canada',
    name: 'RBC Royal Bank',
    country: 'CA',
    mapping: {
      date: ['transaction date'],
      description: ['description 1', 'description 2'],
      debit: ['cad$', 'usd$'],
      credit: [],
      balance: [],
    },
    amountStrategy: 'debit-credit',
    debitSign: 'positive',
  },
  {
    id: 'cibc-canada',
    name: 'CIBC',
    country: 'CA',
    mapping: {
      date: ['date'],
      description: ['description'],
      debit: ['debit'],
      credit: ['credit'],
      balance: [],
    },
    amountStrategy: 'debit-credit',
    debitSign: 'positive',
  },
  {
    id: 'bmo-canada',
    name: 'BMO Bank of Montreal',
    country: 'CA',
    mapping: {
      date: ['date'],
      description: ['description'],
      debit: ['withdrawals'],
      credit: ['deposits'],
      balance: ['balance'],
    },
    amountStrategy: 'debit-credit',
    debitSign: 'positive',
  },
  {
    id: 'scotiabank-canada',
    name: 'Scotiabank',
    country: 'CA',
    mapping: {
      date: ['date'],
      description: ['description'],
      amount: ['amount'],
      balance: [],
    },
    amountStrategy: 'single',
    debitSign: 'negative',
  },
  // ── United States ────────────────────────────────────────────────────────────
  {
    id: 'chase-us',
    name: 'Chase',
    country: 'US',
    mapping: {
      date: ['transaction date'],
      description: ['description'],
      amount: ['amount'],
      category: ['category'],
      reference: ['memo'],
    },
    amountStrategy: 'single',
    debitSign: 'negative',
  },
  {
    id: 'bofa-us',
    name: 'Bank of America',
    country: 'US',
    mapping: {
      date: ['posted date', 'date'],
      description: ['payee', 'description'],
      amount: ['amount'],
      reference: ['reference number'],
    },
    amountStrategy: 'single',
    debitSign: 'negative',
  },
  {
    id: 'wellsfargo-us',
    name: 'Wells Fargo',
    country: 'US',
    mapping: {
      date: ['date'],
      description: ['description'],
      amount: ['amount'],
      balance: ['balance'],
    },
    amountStrategy: 'single',
    debitSign: 'negative',
  },
  {
    id: 'capitalone-us',
    name: 'Capital One',
    country: 'US',
    mapping: {
      date: ['transaction date'],
      description: ['description'],
      debit: ['debit'],
      credit: ['credit'],
      category: ['category'],
    },
    amountStrategy: 'debit-credit',
    debitSign: 'positive',
  },
  {
    id: 'amex-us',
    name: 'American Express',
    country: 'US',
    mapping: {
      date: ['date'],
      description: ['description'],
      amount: ['amount'],
      category: ['category'],
      reference: ['reference'],
    },
    amountStrategy: 'single',
    debitSign: 'positive', // Amex: positive = charge (debit), negative = credit/refund
  },
  // ── Generic fallback ─────────────────────────────────────────────────────────
  {
    id: 'generic',
    name: 'Generic CSV',
    country: 'INTL',
    mapping: {
      date: ['date', 'transaction date', 'posted date', 'trans date'],
      description: ['description', 'payee', 'merchant', 'memo', 'narrative'],
      amount: ['amount', 'value', 'transaction amount'],
      debit: ['debit', 'withdrawal', 'withdrawals', 'dr'],
      credit: ['credit', 'deposit', 'deposits', 'cr'],
      balance: ['balance', 'running balance'],
    },
    amountStrategy: 'single',
    debitSign: 'negative',
  },
];

/**
 * Score a bank format against actual CSV headers.
 * Returns 0–1 match confidence.
 */
function scoreFormat(format: BankFormat, headers: string[]): number {
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());
  const allPatterns = Object.values(format.mapping).flat();
  let matched = 0;
  for (const pattern of allPatterns) {
    if (lowerHeaders.some((h) => h.includes(pattern) || pattern.includes(h))) {
      matched++;
    }
  }
  return matched / Math.max(allPatterns.length, 1);
}

/**
 * Detect the best matching bank format for the given CSV headers.
 * Returns the format and confidence score, or 'generic' as fallback.
 */
export function detectBankFormat(headers: string[]): { format: BankFormat; confidence: number } {
  let best: BankFormat = BANK_FORMATS.find((f) => f.id === 'generic')!;
  let bestScore = 0;

  for (const format of BANK_FORMATS) {
    if (format.id === 'generic') continue;
    const score = scoreFormat(format, headers);
    if (score > bestScore) {
      bestScore = score;
      best = format;
    }
  }

  // Fall back to generic if no confident match
  if (bestScore < 0.3) {
    return { format: BANK_FORMATS.find((f) => f.id === 'generic')!, confidence: bestScore };
  }

  return { format: best, confidence: bestScore };
}

/**
 * Map a single CSV row to a normalized transaction using a bank format.
 * Returns null if required fields are missing.
 */
export function mapRowToTransaction(
  row: Record<string, string>,
  format: BankFormat
): { date: string; description: string; amount: number; reference?: string } | null {
  const lower = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), v]));

  // Find date
  const dateKey = format.mapping.date.find((p) => lower[p] !== undefined);
  const rawDate = dateKey ? lower[dateKey] : undefined;
  if (!rawDate) return null;

  // Find description (concat multiple if needed)
  const descParts = format.mapping.description
    .map((p) => lower[p])
    .filter(Boolean);
  const description = descParts.join(' ').trim();
  if (!description) return null;

  // Compute amount
  let amount: number;
  if (format.amountStrategy === 'debit-credit') {
    const debitKey = format.mapping.debit?.find((p) => lower[p] !== undefined);
    const creditKey = format.mapping.credit?.find((p) => lower[p] !== undefined);
    const debitRaw = debitKey ? parseFloat(lower[debitKey]?.replace(/[^0-9.-]/g, '') || '0') : 0;
    const creditRaw = creditKey ? parseFloat(lower[creditKey]?.replace(/[^0-9.-]/g, '') || '0') : 0;

    if (!isNaN(debitRaw) && debitRaw !== 0) {
      amount = format.debitSign === 'negative' ? -Math.abs(debitRaw) : -debitRaw;
    } else if (!isNaN(creditRaw) && creditRaw !== 0) {
      amount = Math.abs(creditRaw);
    } else {
      return null;
    }
  } else {
    const amtKey = format.mapping.amount?.find((p) => lower[p] !== undefined);
    const raw = amtKey ? lower[amtKey] : undefined;
    if (!raw) return null;
    const parsed = parseFloat(raw.replace(/[^0-9.-]/g, ''));
    if (isNaN(parsed)) return null;
    amount = format.debitSign === 'negative' ? parsed : -parsed;
  }

  // Optional reference
  const refKey = format.mapping.reference?.find((p) => lower[p] !== undefined);
  const reference = refKey ? lower[refKey] : undefined;

  return { date: rawDate, description, amount, reference };
}
