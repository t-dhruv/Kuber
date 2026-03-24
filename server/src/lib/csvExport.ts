import { Response } from 'express';

export interface CsvColumn {
  key: string;
  header: string;
}

/**
 * Escape a single CSV cell value.
 * - Null/undefined → empty string
 * - Values containing commas, double-quotes, or newlines are wrapped in double-quotes
 * - Internal double-quotes are escaped by doubling them
 */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert an array of objects to a CSV string.
 * First row is the header row defined by `columns`.
 * Line endings follow RFC 4180 (\r\n).
 */
export function toCSV(rows: Record<string, unknown>[], columns: CsvColumn[]): string {
  const lines: string[] = [];

  // Header row
  lines.push(columns.map(c => escapeCell(c.header)).join(','));

  // Data rows
  for (const row of rows) {
    lines.push(columns.map(c => escapeCell(row[c.key])).join(','));
  }

  return lines.join('\r\n');
}

/**
 * Set HTTP response headers so the browser treats the response as a CSV download.
 */
export function setCsvHeaders(res: Response, filename: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
}
