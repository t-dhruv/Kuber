import type {
  CanonicalReportingPeriod,
  ComparisonPeriodInput,
  ReportingPeriodInput,
} from './types';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function shiftMonth(month: string, delta: number): string {
  const [yearPart, monthPart] = month.split('-').map(Number);
  const date = new Date(Date.UTC(yearPart, monthPart - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

function shiftYear(dateString: string, delta: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCFullYear(date.getUTCFullYear() + delta);
  return date.toISOString().slice(0, 10);
}

export function normalizeReportingPeriod(input: ReportingPeriodInput): CanonicalReportingPeriod {
  if (input.startDate && input.endDate) {
    return {
      grain: 'day',
      range: 'custom',
      startDate: input.startDate,
      endDate: input.endDate,
    };
  }

  switch (input.preset) {
    case 'last3months':
      return { grain: 'month', range: 'rolling', months: 3 };
    case 'last6months':
      return { grain: 'month', range: 'rolling', months: 6 };
    case 'thisMonth':
      return { grain: 'month', range: 'single', month: currentMonthKey() };
    case 'lastMonth':
      return { grain: 'month', range: 'single', month: shiftMonth(currentMonthKey(), -1) };
    case 'thisYear':
      return { grain: 'month', range: 'single', year: String(new Date().getUTCFullYear()) };
    case 'lastYear':
      return { grain: 'month', range: 'single', year: String(new Date().getUTCFullYear() - 1) };
    case 'custom':
      return { grain: 'day', range: 'custom', startDate: input.startDate, endDate: input.endDate };
    default:
      return { grain: 'month', range: 'rolling', months: 3 };
  }
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;
}

export function resolveComparisonPeriod(input: ComparisonPeriodInput): CanonicalReportingPeriod {
  const { period, comparison = 'none' } = input;

  if (comparison === 'none') {
    return period;
  }

  if (period.grain === 'month' && period.month) {
    if (comparison === 'mom') {
      return { ...period, month: shiftMonth(period.month, -1) };
    }
    if (comparison === 'yoy') {
      return { ...period, month: shiftMonth(period.month, -12) };
    }
  }

  if (period.range === 'custom' && period.startDate && period.endDate) {
    if (comparison === 'yoy') {
      return {
        ...period,
        startDate: shiftYear(period.startDate, -1),
        endDate: shiftYear(period.endDate, -1),
      };
    }
    if (comparison === 'mom') {
      return {
        ...period,
        startDate: shiftMonth(period.startDate.slice(0, 7), -1) + period.startDate.slice(7),
        endDate: shiftMonth(period.endDate.slice(0, 7), -1) + period.endDate.slice(7),
      };
    }
  }

  return period;
}
