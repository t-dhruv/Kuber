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

// ── Date format auto-detection ────────────────────────────────────────────────

interface DateFormatCandidate {
  label: string;
  regex: RegExp;
  parse: (m: RegExpMatchArray) => string; // returns YYYY-MM-DD
}

const DATE_FORMAT_CANDIDATES: DateFormatCandidate[] = [
  {
    label: 'YYYY-MM-DD',
    regex: /^\d{4}-\d{2}-\d{2}$/,
    parse: (m) => m[0],
  },
  {
    label: 'MM/DD/YYYY',
    regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    parse: ([, m, d, y]) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`,
  },
  {
    label: 'DD/MM/YYYY',
    regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    parse: ([, d, m, y]) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`,
  },
  {
    label: 'MM-DD-YYYY',
    regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
    parse: ([, m, d, y]) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`,
  },
  {
    label: 'DD-MM-YYYY',
    regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
    parse: ([, d, m, y]) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`,
  },
  {
    label: 'DD-Mon-YYYY',
    regex: /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/,
    parse: ([, d, mon, y]) => {
      const months: Record<string, string> = {
        jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
        jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
      };
      return `${y}-${months[mon.toLowerCase()] ?? '01'}-${d.padStart(2, '0')}`;
    },
  },
  {
    label: 'Mon DD YYYY',
    regex: /^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/,
    parse: ([, mon, d, y]) => {
      const months: Record<string, string> = {
        jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
        jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
      };
      return `${y}-${months[mon.toLowerCase()] ?? '01'}-${d.padStart(2, '0')}`;
    },
  },
  {
    label: 'YYYYMMDD',
    regex: /^(\d{4})(\d{2})(\d{2})$/,
    parse: ([, y, m, d]) => `${y}-${m}-${d}`,
  },
];

/**
 * Given a sample of raw date strings from a CSV column, detect the most likely
 * date format. Returns the format label (e.g. "MM/DD/YYYY") and a parse function.
 * Falls back to null if no format matches all samples.
 */
export function detectDateFormat(
  samples: string[],
): { label: string; parse: (raw: string) => string | null } | null {
  const nonEmpty = samples.map((s) => s.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return null;

  for (const candidate of DATE_FORMAT_CANDIDATES) {
    const allMatch = nonEmpty.every((s) => candidate.regex.test(s));
    if (!allMatch) continue;

    // Validate dates are actually valid (no month 13, etc.)
    const allValid = nonEmpty.every((s) => {
      const m = s.match(candidate.regex);
      if (!m) return false;
      const iso = candidate.parse(m as unknown as RegExpMatchArray);
      const d = new Date(iso);
      return !isNaN(d.getTime());
    });

    if (!allValid) continue;

    // Extra disambiguation: MM/DD vs DD/MM
    // If the candidate is DD/MM/YYYY, check at least one day > 12 in the samples
    // to confirm DD is actually day (not month)
    if (candidate.label === 'DD/MM/YYYY' || candidate.label === 'DD-MM-YYYY') {
      const hasUnambiguousDay = nonEmpty.some((s) => {
        const m = s.match(candidate.regex);
        if (!m) return false;
        return parseInt(m[1]) > 12;
      });
      if (!hasUnambiguousDay) continue; // ambiguous — skip, prefer MM/DD
    }

    return {
      label: candidate.label,
      parse: (raw: string) => {
        const m = raw.trim().match(candidate.regex);
        if (!m) return null;
        try {
          return candidate.parse(m as unknown as RegExpMatchArray);
        } catch {
          return null;
        }
      },
    };
  }

  return null;
}
