/**
 * investmentIntel.ts
 * Investment intelligence endpoints — news per holding, Monte Carlo projections, automation intel feed.
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';

const router = Router();

// ── GET /api/v1/investment-intel/news?ticker=VFV.TO ─────────────────────────
// Fetches recent news headlines for a ticker via Yahoo Finance RSS feed.
// No API key required — uses public RSS.

router.get('/news', async (req: AuthRequest, res: Response) => {
  const ticker = (req.query.ticker as string)?.toUpperCase().trim();
  if (!ticker || ticker.length > 12) {
    return res.status(400).json({ error: 'ticker is required (max 12 chars)' });
  }

  try {
    // Yahoo Finance RSS — public, no auth needed
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Kuber/1.0 personal-finance-app' },
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'News feed unavailable' });
    }

    const xml = await response.text();

    // Parse RSS items — simple regex extraction (avoids xml2js dependency)
    const items: Array<{ title: string; link: string; pubDate: string; description: string }> = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 10) {
      const block = match[1];
      const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
        ?? block.match(/<title>(.*?)<\/title>/)?.[1] ?? '';
      const link = block.match(/<link>(.*?)<\/link>/)?.[1] ?? '';
      const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? '';
      const description = block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1]
        ?? block.match(/<description>(.*?)<\/description>/)?.[1] ?? '';
      if (title) items.push({ title, link, pubDate, description: description.slice(0, 200) });
    }

    return res.json({ ticker, items });
  } catch (err) {
    req.log.error({ err }, 'investment-intel/news');
    return res.status(502).json({ error: 'Could not fetch news' });
  }
});

// ── GET /api/v1/investment-intel/projections ───────────────────────────────
// Monte Carlo simulation on the household's investment portfolio.
// Returns percentile outcomes (10th, 50th, 90th) at 5, 10, 20, 30 year horizons.

router.get('/projections', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const yearsParam = parseInt(req.query.years as string) || 30;
    const years = Math.min(Math.max(yearsParam, 1), 50);

    // Get all investment holdings for the household
    const accounts = await prisma.account.findMany({
      where: { householdId, type: 'investment' },
      include: {
        investmentHoldings: {
          select: { shares: true, currentPrice: true, costBasis: true },
        },
      },
    });

    const totalValue = accounts
      .flatMap((a) => a.investmentHoldings)
      .reduce((sum, h) => sum + h.shares * h.currentPrice, 0);

    if (totalValue <= 0) {
      return res.json({ totalValue: 0, horizons: [], simulations: 1000 });
    }

    // Monthly contributions estimate from recurring investments
    const recurringInvestments = await prisma.recurringInvestment.findMany({
      where: { holding: { account: { householdId } }, status: 'active' },
      select: { amount: true, frequency: true },
    });

    const monthlyContrib = recurringInvestments.reduce((sum, ri) => {
      const monthly = ri.frequency === 'weekly' ? ri.amount * 4.33
        : ri.frequency === 'biweekly' ? ri.amount * 2.17
        : ri.frequency === 'quarterly' ? ri.amount / 3
        : ri.amount; // monthly
      return sum + monthly;
    }, 0);

    // Monte Carlo parameters (diversified portfolio assumptions)
    const MEAN_ANNUAL_RETURN = 0.07;   // 7% real return (historical S&P average)
    const ANNUAL_STD_DEV = 0.15;       // 15% standard deviation
    const SIMULATIONS = 1000;
    const HORIZONS = [5, 10, 20, Math.min(years, 30)].filter((v, i, a) => a.indexOf(v) === i);

    // Box-Muller transform for normal random numbers
    function randn(): number {
      const u1 = Math.random(), u2 = Math.random();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }

    const results: Record<number, number[]> = {};
    for (const horizon of HORIZONS) results[horizon] = [];

    for (let sim = 0; sim < SIMULATIONS; sim++) {
      let portfolio = totalValue;
      let monthsElapsed = 0;

      for (const horizon of HORIZONS.sort((a, b) => a - b)) {
        const targetMonths = horizon * 12;
        while (monthsElapsed < targetMonths) {
          const monthlyReturn = MEAN_ANNUAL_RETURN / 12 + (ANNUAL_STD_DEV / Math.sqrt(12)) * randn();
          portfolio = portfolio * (1 + monthlyReturn) + monthlyContrib;
          monthsElapsed++;
        }
        results[horizon].push(portfolio);
      }
    }

    const horizons = HORIZONS.map((h) => {
      const sorted = results[h].sort((a, b) => a - b);
      return {
        years: h,
        p10: Math.round(sorted[Math.floor(SIMULATIONS * 0.1)]),
        p50: Math.round(sorted[Math.floor(SIMULATIONS * 0.5)]),
        p90: Math.round(sorted[Math.floor(SIMULATIONS * 0.9)]),
      };
    });

    return res.json({
      totalValue: Math.round(totalValue),
      monthlyContrib: Math.round(monthlyContrib),
      simulations: SIMULATIONS,
      horizons,
    });
  } catch (err) {
    req.log.error({ err }, 'investment-intel/projections');
    return res.status(500).json({ error: 'Projection failed' });
  }
});

// ── POST /api/v1/investment-intel/feed — receive intel from automation tools ─
const feedSchema = z.object({
  source: z.enum(['news', 'youtube', 'manual']),
  title: z.string().min(1).max(500),
  summary: z.string().min(1),
  url: z.string().url().optional(),
  ticker: z.string().max(20).optional(),
  sentiment: z.enum(['bullish', 'bearish', 'neutral']).optional(),
  publishedAt: z.string().datetime().optional(),
});

router.post('/feed', async (req: AuthRequest, res: Response) => {
  const parse = feedSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.issues[0]?.message });
  const { source, title, summary, url, ticker, sentiment, publishedAt } = parse.data;
  const intel = await prisma.investmentIntel.create({
    data: {
      householdId: req.householdId!,
      source, title, summary,
      url: url ?? null,
      ticker: ticker ?? null,
      sentiment: sentiment ?? null,
      publishedAt: publishedAt ? new Date(publishedAt) : null,
    },
  });
  return res.status(201).json(intel);
});

// ── GET /api/v1/investment-intel/feed — list intel items ─────────────────────
router.get('/feed', async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const items = await prisma.investmentIntel.findMany({
    where: { householdId: req.householdId! },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  });
  return res.json(items);
});

export default router;
