/**
 * dateUtils.ts
 * Shared date parsing utilities for import flows.
 * Tries multiple common North American bank date formats.
 */

const MONTH_ABBR: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Attempt to parse a date string using common bank formats.
 * Returns an ISO date string (YYYY-MM-DD) or null if unparseable.
 */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // ISO: 2026-01-15
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // ISO with time: 2026-01-15T...
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);

  // MM/DD/YYYY or M/D/YYYY
  const mdySlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdySlash) {
    const [, m, d, y] = mdySlash;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // MM/DD/YY
  const mdyShort = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (mdyShort) {
    const [, m, d, y] = mdyShort;
    const year = parseInt(y) >= 50 ? `19${y}` : `20${y}`;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD/MM/YYYY (European, less common for CA/US but included)
  // Ambiguous with MM/DD — skip unless day > 12

  // MM-DD-YYYY
  const mdyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (mdyDash) {
    const [, m, d, y] = mdyDash;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Jan 15 (no year — assume current year)
  const monDay = s.match(/^([A-Za-z]{3})\s+(\d{1,2})$/);
  if (monDay) {
    const mon = MONTH_ABBR[monDay[1].toLowerCase()];
    if (mon) {
      const year = new Date().getFullYear();
      return `${year}-${String(mon).padStart(2, '0')}-${monDay[2].padStart(2, '0')}`;
    }
  }

  // Jan 15 2026
  const monDayYear = s.match(/^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/);
  if (monDayYear) {
    const mon = MONTH_ABBR[monDayYear[1].toLowerCase()];
    if (mon) {
      return `${monDayYear[3]}-${String(mon).padStart(2, '0')}-${monDayYear[2].padStart(2, '0')}`;
    }
  }

  // 15-Jan-2026
  const dayMonYear = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (dayMonYear) {
    const mon = MONTH_ABBR[dayMonYear[2].toLowerCase()];
    if (mon) {
      return `${dayMonYear[3]}-${String(mon).padStart(2, '0')}-${dayMonYear[1].padStart(2, '0')}`;
    }
  }

  // Last resort: JS Date parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);

  return null;
}
