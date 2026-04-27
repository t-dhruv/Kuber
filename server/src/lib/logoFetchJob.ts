import { prisma } from './prisma';
import { getOrFetchBankLogo, getOrFetchMerchantLogo } from '../services/logoService';

const MAX_PER_RUN = 200;
const REQUEST_DELAY_MS = 200;
const RETRY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function normalizeKey(name: string): string {
  return name.toLowerCase().trim();
}

type LogoItem = { type: 'bank' | 'merchant'; name: string };

async function collectItems(): Promise<LogoItem[]> {
  const now = Date.now();
  const retryBefore = new Date(now - RETRY_COOLDOWN_MS);

  const allCached = await prisma.logoCache.findMany({
    select: { type: true, key: true, logoData: true, fetchedAt: true },
  });

  const cachedMerchantKeys = new Set(
    allCached
      .filter(c => c.type === 'merchant' && c.logoData !== null)
      .map(c => c.key)
  );
  const cachedBankKeys = new Set(
    allCached
      .filter(c => c.type === 'bank' && c.logoData !== null)
      .map(c => c.key)
  );

  const merchants = await prisma.merchant.findMany({ select: { name: true } });
  const missingMerchants: LogoItem[] = merchants
    .filter(m => !cachedMerchantKeys.has(normalizeKey(m.name)))
    .map(m => ({ type: 'merchant' as const, name: m.name }));

  const accounts = await prisma.account.findMany({
    where: { institution: { not: null } },
    select: { institution: true },
  });
  const missingBanks: LogoItem[] = accounts
    .filter(a => a.institution && !cachedBankKeys.has(normalizeKey(a.institution)))
    .map(a => ({ type: 'bank' as const, name: a.institution! }));

  const retryItems: LogoItem[] = allCached
    .filter(c => c.logoData === null && c.fetchedAt < retryBefore)
    .map(e => ({ type: e.type as 'bank' | 'merchant', name: e.key }));

  const seen = new Set<string>();
  const all: LogoItem[] = [];
  for (const item of [...missingMerchants, ...missingBanks, ...retryItems]) {
    const dedupeKey = `${item.type}:${normalizeKey(item.name)}`;
    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      all.push(item);
    }
  }

  return all.slice(0, MAX_PER_RUN);
}

async function processItem(item: LogoItem): Promise<'ok' | 'failed'> {
  const key = normalizeKey(item.name);

  await prisma.logoCache.deleteMany({ where: { type: item.type, key, logoData: null } });

  const result =
    item.type === 'bank'
      ? await getOrFetchBankLogo(item.name)
      : await getOrFetchMerchantLogo(item.name);

  if (!result) {
    await prisma.logoCache.upsert({
      where: { type_key: { type: item.type, key } },
      create: { type: item.type, key, fetchedAt: new Date() },
      update: { fetchedAt: new Date() },
    });
    return 'failed';
  }

  return 'ok';
}

export async function runLogoFetchJob(): Promise<void> {
  const items = await collectItems();

  let fetched = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    const result = await processItem(items[i]);
    if (result === 'ok') fetched++;
    else failed++;
    if (i < items.length - 1) {
      await delay(REQUEST_DELAY_MS);
    }
  }

  console.log(`[logo-fetch] total=${items.length} ok=${fetched} failed=${failed}`);
}
