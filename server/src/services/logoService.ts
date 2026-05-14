import { prisma } from '../lib/prisma';

const BANK_DOMAIN_MAP: Record<string, string> = {
  'chase': 'chase.com',
  'jpmorgan': 'jpmorgan.com',
  'bank of america': 'bankofamerica.com',
  'capital one': 'capitalone.com',
  'citibank': 'citibank.com',
  'citi': 'citibank.com',
  'us bank': 'usbank.com',
  'usbank': 'usbank.com',
  'pnc': 'pnc.com',
  'truist': 'truist.com',
  'wells fargo': 'wellsfargo.com',
  'regions': 'regions.com',
  'fifth third': '53.com',
  'huntington': 'huntington.com',
  'citizens bank': 'citizensbank.com',
  'ally': 'ally.com',
  'discover': 'discover.com',
  'american express': 'americanexpress.com',
  'amex': 'americanexpress.com',
  'hsbc': 'hsbc.com',
  'goldman sachs': 'goldmansachs.com',
  'marcus': 'marcus.com',
  'charles schwab': 'schwab.com',
  'schwab': 'schwab.com',
  'fidelity': 'fidelity.com',
  'td bank': 'td.com',
  'td': 'td.com',
  'etrade': 'etrade.com',
  'chime': 'chime.com',
  'keybank': 'key.com',
  'key bank': 'key.com',
  'usaa': 'usaa.com',
  'robinhood': 'robinhood.com',
  'paypal': 'paypal.com',
  'stripe': 'stripe.com',
  'venmo': 'venmo.com',
  'bny mellon': 'bnymellon.com',
  'morgan stanley': 'morganstanley.com',
  'merrill': 'merrilledge.com',
  'santander': 'santander.com',
  'barclays': 'barclays.com',
  'lloyds': 'lloydsbank.com',
  'rbc': 'rbcroyalbank.com',
  'scotiabank': 'scotiabank.com',
  'cibc': 'cibc.com',
  'bmo': 'bmo.com',
  'westpac': 'westpac.com.au',
  'anz': 'anz.com',
  'commonwealth bank': 'commbank.com.au',
  'nab': 'nab.com.au',
  'icici': 'icicibank.com',
  'hdfc': 'hdfcbank.com',
  'sbi': 'onlinesbi.com',
  'axis bank': 'axisbank.com',
  'klarna': 'klarna.com',
  'wise': 'wise.com',
  'revolut': 'revolut.com',
  'monzo': 'monzo.com',
  'n26': 'n26.com',
  'starling': 'starlingbank.com',
  'sofi': 'sofi.com',
};

export type LogoResult = { data: Buffer; mimeType: string };

function normalizeName(name: string): string {
  return name.toLowerCase().trim();
}

function fuzzyMatch(input: string, key: string): boolean {
  if (input.includes(key)) return true;
  // word-level: every word in key appears somewhere in input
  const keyWords = key.split(/\s+/);
  return keyWords.every(w => input.includes(w));
}

function deriveDomain(name: string): string {
  const lower = normalizeName(name);

  // Exact substring first, then word-level fuzzy
  for (const [key, domain] of Object.entries(BANK_DOMAIN_MAP)) {
    if (fuzzyMatch(lower, key)) return domain;
  }

  const cleaned = lower
    .replace(/\b(bank|national|federal|savings|trust|credit union|financial|corp|inc|llc|& trust)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
  return `${cleaned}.com`;
}

async function fetchLogoBytes(domain: string): Promise<{ data: Buffer; mimeType: string; source: string } | null> {
  // Primary: Clearbit Logo API
  try {
    const res = await fetch(`https://logo.clearbit.com/${domain}`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const mimeType = res.headers.get('content-type') ?? 'image/png';
      const data = Buffer.from(await res.arrayBuffer());
      return { data, mimeType: mimeType.split(';')[0].trim(), source: 'clearbit' };
    }
  } catch {
    // fall through
  }

  // Fallback: DuckDuckGo favicon
  try {
    const res = await fetch(`https://icons.duckduckgo.com/ip3/${domain}.ico`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const mimeType = res.headers.get('content-type') ?? 'image/x-icon';
      const data = Buffer.from(await res.arrayBuffer());
      return { data, mimeType: mimeType.split(';')[0].trim(), source: 'duckduckgo' };
    }
  } catch {
    // fall through
  }

  return null;
}

export async function getOrFetchBankLogo(institutionName: string): Promise<LogoResult | null> {
  const key = normalizeName(institutionName);

  const cached = await prisma.logoCache.findUnique({ where: { type_key: { type: 'bank', key } } });
  if (cached) {
    if (!cached.logoData || !cached.mimeType) return null;
    return { data: cached.logoData as Buffer, mimeType: cached.mimeType };
  }

  const domain = deriveDomain(institutionName);
  const result = await fetchLogoBytes(domain);
  if (!result) return null;

  await prisma.logoCache.upsert({
    where: { type_key: { type: 'bank', key } },
    create: { type: 'bank', key, logoData: result.data, mimeType: result.mimeType, source: result.source },
    update: { logoData: result.data, mimeType: result.mimeType, source: result.source, fetchedAt: new Date() },
  });

  return { data: result.data, mimeType: result.mimeType };
}

export async function getOrFetchMerchantLogo(merchantName: string, domain?: string): Promise<LogoResult | null> {
  const key = normalizeName(merchantName);

  const cached = await prisma.logoCache.findUnique({ where: { type_key: { type: 'merchant', key } } });
  if (cached) {
    if (!cached.logoData || !cached.mimeType) return null;
    return { data: cached.logoData as Buffer, mimeType: cached.mimeType };
  }

  const lookupDomain = domain ?? deriveDomain(merchantName);
  const result = await fetchLogoBytes(lookupDomain);
  if (!result) return null;

  await prisma.logoCache.upsert({
    where: { type_key: { type: 'merchant', key } },
    create: { type: 'merchant', key, logoData: result.data, mimeType: result.mimeType, source: result.source },
    update: { logoData: result.data, mimeType: result.mimeType, source: result.source, fetchedAt: new Date() },
  });

  return { data: result.data, mimeType: result.mimeType };
}
