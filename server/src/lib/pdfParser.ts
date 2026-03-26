/**
 * pdfParser.ts
 * Parse bank statement PDFs into raw text rows.
 * Primary: pdf-parse (text extraction from digital PDFs)
 * Fallback: AI extraction prompt for complex/scanned PDFs
 */

import type { BankFormat } from './bankFormats.js';

export interface PdfParseResult {
  rows: Array<{ date: string; description: string; amount: number; reference?: string }>;
  rawText: string;
  pageCount: number;
  method: 'pdf-parse' | 'ai-extraction' | 'failed';
  error?: string;
}

/**
 * Parse a PDF buffer into transaction rows.
 * Uses pdf-parse for text extraction, then applies regex patterns to find transactions.
 */
export async function parsePdfStatement(
  buffer: Buffer,
  _format?: BankFormat
): Promise<PdfParseResult> {
  let pdfParse: ((buffer: Buffer) => Promise<{ text: string; numpages: number }>) | null = null;

  try {
    // Dynamic require — pdf-parse is optional dependency
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const mod = require('pdf-parse') as any;
    pdfParse = (typeof mod === 'function' ? mod : mod.default) ?? null;
  } catch {
    // pdf-parse not installed
  }

  if (!pdfParse) {
    return {
      rows: [],
      rawText: '',
      pageCount: 0,
      method: 'failed',
      error: 'pdf-parse not installed. Run: npm install pdf-parse --prefix server',
    };
  }

  try {
    const data = await pdfParse(buffer);
    const rows = extractTransactionsFromText(data.text);
    return {
      rows,
      rawText: data.text,
      pageCount: data.numpages,
      method: 'pdf-parse',
    };
  } catch (err) {
    return {
      rows: [],
      rawText: '',
      pageCount: 0,
      method: 'failed',
      error: `PDF parse failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Extract transaction rows from raw PDF text using common bank statement patterns.
 * Supports most North American bank PDF formats.
 *
 * Pattern: date  description  [optional ref]  amount  [optional balance]
 * Examples:
 *   Jan 15  TIM HORTONS #1234  -4.75
 *   2026-01-15  AMAZON.COM  29.99
 *   01/15/2026  PAYROLL DEPOSIT  2,500.00
 */
function extractTransactionsFromText(
  text: string
): Array<{ date: string; description: string; amount: number; reference?: string }> {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const results: Array<{ date: string; description: string; amount: number }> = [];

  // Date patterns
  const datePat = [
    /^\d{4}-\d{2}-\d{2}/,                      // ISO: 2026-01-15
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i, // Jan 15
    /^\d{1,2}\/\d{1,2}\/\d{2,4}/,              // MM/DD/YYYY or M/D/YY
    /^\d{1,2}-\d{1,2}-\d{2,4}/,               // MM-DD-YYYY
  ];

  // Amount pattern: optional -, digits, optional comma-groups, decimal, 2 digits
  const amountPat = /(-?\$?[\d,]+\.\d{2})\s*$/;

  for (const line of lines) {
    const hasDate = datePat.some((p) => p.test(line));
    if (!hasDate) continue;

    const amtMatch = line.match(amountPat);
    if (!amtMatch) continue;

    const rawAmount = amtMatch[1].replace(/[$,]/g, '');
    const amount = parseFloat(rawAmount);
    if (isNaN(amount)) continue;

    // Everything between date and amount = description
    const withoutAmount = line.slice(0, line.length - amtMatch[0].length).trim();

    // Extract date (first token or first date-like segment)
    let dateStr = '';
    let description = withoutAmount;

    for (const pat of datePat) {
      const m = withoutAmount.match(pat);
      if (m) {
        dateStr = m[0];
        description = withoutAmount.slice(m[0].length).trim();
        break;
      }
    }

    if (!dateStr || !description) continue;

    results.push({ date: dateStr, description, amount });
  }

  return results;
}

/**
 * Build an AI prompt for extracting transactions from raw PDF text.
 * Used as fallback when regex extraction yields too few results.
 */
export function buildAiExtractionPrompt(rawText: string): string {
  const excerpt = rawText.slice(0, 4000); // limit to avoid token overflow
  return `You are parsing a bank statement. Extract all transactions from the text below.
Return a JSON array of objects with these fields:
- date: ISO date string (YYYY-MM-DD)
- description: merchant or transaction description
- amount: number (negative for debits/charges, positive for credits/deposits)

Only return the JSON array, no other text. If you cannot find transactions, return [].

Bank statement text:
${excerpt}`;
}
