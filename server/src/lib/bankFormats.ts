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
  // ── Investment Brokerages ──────────────────────────────────────────────────
  {
    id: 'questrade-ca',
    name: 'Questrade',
    country: 'CA',
    mapping: {
      date: ['transaction date', 'settlement date'],
      description: ['description', 'symbol', 'activity type'],
      amount: ['net amount', 'amount'],
      reference: ['transaction id'],
    },
    amountStrategy: 'single',
    debitSign: 'negative',
  },
  {
    id: 'wealthsimple-ca',
    name: 'Wealthsimple',
    country: 'CA',
    mapping: {
      date: ['date'],
      description: ['activity', 'description', 'symbol'],
      amount: ['amount', 'net amount'],
      reference: ['id'],
    },
    amountStrategy: 'single',
    debitSign: 'negative',
  },
  {
    id: 'ibkr',
    name: 'Interactive Brokers',
    country: 'INTL',
    mapping: {
      date: ['date/time', 'settle date/time', 'date'],
      description: ['symbol', 'description'],
      amount: ['proceeds', 'amount', 'realized p/l'],
      reference: ['trade id', 'order id'],
    },
    amountStrategy: 'single',
    debitSign: 'negative',
  },
  {
    id: 'td-direct-ca',
    name: 'TD Direct Investing',
    country: 'CA',
    mapping: {
      date: ['settlement date', 'transaction date'],
      description: ['description', 'symbol'],
      debit: ['debit'],
      credit: ['credit'],
    },
    amountStrategy: 'debit-credit',
    debitSign: 'positive',
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

function countFormatMatches(format: BankFormat, headers: string[]): number {
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());
  return Object.values(format.mapping)
    .flat()
    .filter((pattern) => lowerHeaders.some((h) => h.includes(pattern) || pattern.includes(h)))
    .length;
}

/**
 * Detect the best matching bank format for the given CSV headers.
 * Returns the format and confidence score, or 'generic' as fallback.
 */
/**
 * Check that a format's required fields (date, description, and at least one amount field)
 * are all present in the CSV headers. Prevents high-scoring false matches like detecting
 * a generic "Date,Description,Amount" CSV as Amex just because it shares 3 column names.
 */
function hasAllRequiredFields(format: BankFormat, lowerHeaders: string[]): boolean {
  const matches = (patterns: string[]) =>
    patterns.some((p) => lowerHeaders.some((h) => h.includes(p) || p.includes(h)));

  const hasDate = matches(format.mapping.date);
  const hasDesc = matches(format.mapping.description);
  const hasAmount =
    format.amountStrategy === 'single'
      ? matches(format.mapping.amount ?? [])
      : matches(format.mapping.debit ?? []) || matches(format.mapping.credit ?? []);

  return hasDate && hasDesc && hasAmount;
}

function matchesAnyHeader(patterns: string[], header: string): boolean {
  return patterns.some((p) => header.includes(p) || p.includes(header));
}

function hasOnlyGenericSingleAmountHeaders(lowerHeaders: string[]): boolean {
  const generic = BANK_FORMATS.find((f) => f.id === 'generic')!;
  const genericSingleAmountPatterns = [
    ...generic.mapping.date,
    ...generic.mapping.description,
    ...(generic.mapping.amount ?? []),
  ];

  const hasDate = lowerHeaders.some((h) => matchesAnyHeader(generic.mapping.date, h));
  const hasDesc = lowerHeaders.some((h) => matchesAnyHeader(generic.mapping.description, h));
  const hasAmount = lowerHeaders.some((h) => matchesAnyHeader(generic.mapping.amount ?? [], h));

  return (
    hasDate &&
    hasDesc &&
    hasAmount &&
    lowerHeaders.every((h) => matchesAnyHeader(genericSingleAmountPatterns, h))
  );
}

export function detectBankFormat(headers: string[]): { format: BankFormat; confidence: number } {
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());
  const generic = BANK_FORMATS.find((f) => f.id === 'generic')!;

  if (hasOnlyGenericSingleAmountHeaders(lowerHeaders)) {
    return { format: generic, confidence: 0 };
  }

  let best: BankFormat = generic;
  let bestScore = 0;
  let bestMatched = 0;
  let ambiguousBest = false;

  for (const format of BANK_FORMATS) {
    if (format.id === 'generic') continue;
    // A format must cover all required fields AND score above a minimum threshold
    if (!hasAllRequiredFields(format, lowerHeaders)) continue;
    const score = scoreFormat(format, headers);
    const matched = countFormatMatches(format, headers);
    // Use a higher threshold (0.6) so ambiguous CSVs fall back to generic
    if (score >= 0.6 && (score > bestScore || (score === bestScore && matched > bestMatched))) {
      bestScore = score;
      bestMatched = matched;
      best = format;
      ambiguousBest = false;
    } else if (score >= 0.6 && score === bestScore && matched === bestMatched) {
      ambiguousBest = true;
    }
  }

  if (bestScore < 0.6 || ambiguousBest) {
    return { format: generic, confidence: bestScore };
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
