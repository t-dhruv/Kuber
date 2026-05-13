/**
 * amountParser.ts
 * Robust amount string parser for bank CSV imports.
 * Handles: 1,234.56 | 1.234,56 | (1234.56) | 1234.56 CR | 1234.56 DR | plain 1234.56
 */

export type LocaleFormat = 'us' | 'eu'; // us = 1,234.56 | eu = 1.234,56

/**
 * Detect whether a set of raw amount strings use US (1,234.56) or EU (1.234,56) formatting.
 * Heuristic: if any sample has a comma followed by exactly 3 digits then a period, it's EU.
 */
export function detectLocaleFormat(samples: string[]): LocaleFormat {
  let euVotes = 0;
  let usVotes = 0;

  for (const raw of samples) {
    const s = raw.trim();
    // EU pattern: digits, period as thousands separator, comma as decimal
    // e.g. 1.234,56 or 1.234.567,89
    if (/\d{1,3}(\.\d{3})+,\d{2}/.test(s)) {
      euVotes++;
    }
    // US pattern: digits, comma as thousands separator, period as decimal
    // e.g. 1,234.56
    else if (/\d{1,3}(,\d{3})+\.\d{2}/.test(s)) {
      usVotes++;
    }
    // Plain comma-only (could be EU decimal comma without thousands sep)
    // e.g. 1234,56
    else if (/^\d+,\d{2}$/.test(s)) {
      euVotes++;
    }
  }

  return euVotes > usVotes ? 'eu' : 'us';
}

/**
 * Parse a raw amount string to a number.
 * Returns null if the string cannot be parsed.
 *
 * Sign convention:
 * - "CR" / "+" suffix/prefix → positive (money in)
 * - "DR" / "-" / accounting parens "(1234)" → negative (money out)
 * - No suffix → preserve sign from numeric value
 */
export function parseAmount(raw: string, locale: LocaleFormat = 'us'): number | null {
  if (!raw || !raw.trim()) return null;

  let s = raw.trim();

  // Detect explicit sign indicators before stripping
  const hasCR = /\bCR\b/i.test(s) || s.startsWith('+');
  const hasDR = /\bDR\b/i.test(s);
  const hasParens = /^\(.*\)$/.test(s); // accounting negative: (1234.56)

  // Strip currency symbols, CR/DR markers, whitespace
  s = s
    .replace(/\bCR\b/gi, '')
    .replace(/\bDR\b/gi, '')
    .replace(/[()]/g, '')       // remove accounting parens
    .replace(/[$£€¥₹]/g, '')   // currency symbols
    .replace(/\+/g, '')
    .trim();

  // Normalize locale-specific formatting
  let normalized: string;
  if (locale === 'eu') {
    // EU: 1.234,56 → remove thousand-sep dots, convert decimal comma to dot
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else {
    // US: 1,234.56 → remove thousand-sep commas
    normalized = s.replace(/,/g, '');
  }

  const value = parseFloat(normalized);
  if (isNaN(value)) return null;

  // Apply sign
  if (hasParens || hasDR) return -Math.abs(value);
  if (hasCR) return Math.abs(value);
  return value;
}

/**
 * Given debit and credit raw strings, compute a single signed amount.
 * Debit = money out (negative), Credit = money in (positive).
 *
 * @param debitRaw - raw debit string (may be empty/zero)
 * @param creditRaw - raw credit string (may be empty/zero)
 * @param locale - detected locale format
 */
export function mergeDebitCredit(
  debitRaw: string,
  creditRaw: string,
  locale: LocaleFormat = 'us',
): number | null {
  const debit = parseAmount(debitRaw, locale);
  const credit = parseAmount(creditRaw, locale);

  const debitVal = debit !== null && !isNaN(debit) ? Math.abs(debit) : 0;
  const creditVal = credit !== null && !isNaN(credit) ? Math.abs(credit) : 0;

  if (debitVal !== 0) return -debitVal;
  if (creditVal !== 0) return creditVal;
  return null;
}
