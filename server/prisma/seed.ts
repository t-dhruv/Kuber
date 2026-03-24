import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let rngState = 12345;
function rng(): number {
  rngState ^= rngState << 13;
  rngState ^= rngState >> 17;
  rngState ^= rngState << 5;
  return Math.abs(rngState) / 2147483647;
}

function randomBetween(min: number, max: number): number {
  return Math.round((min + rng() * (max - min)) * 100) / 100;
}
function randomInt(min: number, max: number): number {
  return Math.floor(min + rng() * (max - min + 1));
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function maybe(prob = 0.5): boolean {
  return rng() < prob;
}
function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function dayInMonth(base: Date, day: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), day);
  return d;
}

// Enumerate every calendar day between two dates (inclusive)
function eachDay(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Clearing existing data…');

  await prisma.goalAllocation.deleteMany();
  await prisma.transactionTag.deleteMany();
  await prisma.holdingLot.deleteMany();
  await prisma.recurringInvestment.deleteMany();
  await prisma.investmentHolding.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.budget.deleteMany();
  await prisma.recurringItem.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.rule.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.merchant.deleteMany();
  await prisma.category.deleteMany();
  await prisma.categoryGroup.deleteMany();
  await prisma.account.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.userPreference.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.householdInvite.deleteMany();
  await prisma.householdMember.deleteMany();
  await prisma.household.deleteMany();
  await prisma.user.deleteMany();

  console.log('Seeding…');

  // -------------------------------------------------------------------------
  // User + Household (Canadian)
  // -------------------------------------------------------------------------

  const passwordHash = await bcrypt.hash('password123', 12);

  const user = await prisma.user.create({
    data: {
      email: 'demo@kuber.app',
      passwordHash,
      firstName: 'Arjun',
      lastName: 'Sharma',
      timezone: 'America/Toronto',
      theme: 'system',
    },
  });

  const household = await prisma.household.create({
    data: {
      name: 'Sharma Household',
      currency: 'CAD',
      fiscalYearStart: 1,
    },
  });

  await prisma.householdMember.create({
    data: { userId: user.id, householdId: household.id, role: 'owner' },
  });

  // -------------------------------------------------------------------------
  // Accounts (CAD-primary)
  // -------------------------------------------------------------------------

  const tdChecking = await prisma.account.create({
    data: {
      householdId: household.id,
      name: 'TD Everyday Chequing',
      type: 'CHECKING',
      institution: 'TD',
      institutionLogo: 'td',
      balance: 6_420.55,
      lastFour: '3812',
      currency: 'CAD',
    },
  });

  const rbcSavings = await prisma.account.create({
    data: {
      householdId: household.id,
      name: 'RBC High-Interest Savings',
      type: 'SAVINGS',
      institution: 'RBC',
      institutionLogo: 'rbc',
      balance: 14_880.00,
      lastFour: '5529',
      currency: 'CAD',
    },
  });

  const scotiaVisa = await prisma.account.create({
    data: {
      householdId: household.id,
      name: 'Scotia Momentum Visa',
      type: 'CREDIT_CARD',
      institution: 'Scotiabank',
      institutionLogo: 'scotiabank',
      balance: -2_340.80,
      lastFour: '7743',
      currency: 'CAD',
    },
  });

  const tfsaAccount = await prisma.account.create({
    data: {
      householdId: household.id,
      name: 'Questrade TFSA',
      type: 'INVESTMENT',
      institution: 'Questrade',
      institutionLogo: 'questrade',
      balance: 52_800.00,
      lastFour: '0091',
      currency: 'CAD',
    },
  });

  const rrspAccount = await prisma.account.create({
    data: {
      householdId: household.id,
      name: 'Wealthsimple RRSP',
      type: 'INVESTMENT',
      institution: 'Wealthsimple',
      institutionLogo: 'wealthsimple',
      balance: 38_600.00,
      lastFour: '4417',
      currency: 'CAD',
    },
  });

  const usInvestAccount = await prisma.account.create({
    data: {
      householdId: household.id,
      name: 'Fidelity US Brokerage',
      type: 'INVESTMENT',
      institution: 'Fidelity',
      institutionLogo: 'fidelity',
      balance: 18_900.00,
      lastFour: '8823',
      currency: 'USD',
    },
  });

  // -------------------------------------------------------------------------
  // Category Groups + Categories
  // -------------------------------------------------------------------------

  type CategoryDef = { name: string; icon: string };
  type GroupDef = { name: string; type: string; categories: CategoryDef[] };

  const groupDefs: GroupDef[] = [
    {
      name: 'Income',
      type: 'income',
      categories: [
        { name: 'Paycheques', icon: '💼' },
        { name: 'Freelance', icon: '💻' },
        { name: 'Dividends', icon: '📈' },
        { name: 'Investment Gains', icon: '📊' },
        { name: 'Other Income', icon: '➕' },
      ],
    },
    {
      name: 'Food & Dining',
      type: 'expense',
      categories: [
        { name: 'Groceries', icon: '🛒' },
        { name: 'Restaurants', icon: '🍽️' },
        { name: 'Coffee Shops', icon: '☕' },
        { name: 'Takeout & Delivery', icon: '🥡' },
        { name: 'Alcohol & Bars', icon: '🍷' },
      ],
    },
    {
      name: 'Shopping',
      type: 'expense',
      categories: [
        { name: 'Clothing', icon: '👕' },
        { name: 'Electronics', icon: '🖥️' },
        { name: 'Amazon', icon: '📦' },
        { name: 'Online Shopping', icon: '🌐' },
        { name: 'Home & Garden', icon: '🏡' },
      ],
    },
    {
      name: 'Bills & Utilities',
      type: 'expense',
      categories: [
        { name: 'Rent/Mortgage', icon: '🏠' },
        { name: 'Hydro', icon: '⚡' },
        { name: 'Internet', icon: '📶' },
        { name: 'Phone', icon: '📱' },
        { name: 'Subscriptions', icon: '🔄' },
        { name: 'Insurance', icon: '🛡️' },
      ],
    },
    {
      name: 'Transportation',
      type: 'expense',
      categories: [
        { name: 'Gas', icon: '⛽' },
        { name: 'Parking', icon: '🅿️' },
        { name: 'TTC / Transit', icon: '🚆' },
        { name: 'Rideshare', icon: '🚗' },
        { name: 'Car Maintenance', icon: '🔧' },
      ],
    },
    {
      name: 'Health & Wellness',
      type: 'expense',
      categories: [
        { name: 'Gym', icon: '🏋️' },
        { name: 'Doctor / Dental', icon: '🩺' },
        { name: 'Pharmacy', icon: '💊' },
        { name: 'Mental Health', icon: '🧘' },
      ],
    },
    {
      name: 'Entertainment',
      type: 'expense',
      categories: [
        { name: 'Movies & TV', icon: '🎬' },
        { name: 'Music', icon: '🎵' },
        { name: 'Games', icon: '🎮' },
        { name: 'Events & Concerts', icon: '🎟️' },
        { name: 'Sports', icon: '⚽' },
      ],
    },
    {
      name: 'Travel',
      type: 'expense',
      categories: [
        { name: 'Flights', icon: '✈️' },
        { name: 'Hotels', icon: '🛏️' },
        { name: 'Vacation', icon: '🌴' },
        { name: 'Travel Insurance', icon: '🌍' },
      ],
    },
    {
      name: 'Education',
      type: 'expense',
      categories: [
        { name: 'Books & Courses', icon: '📚' },
        { name: 'Professional Development', icon: '🎓' },
      ],
    },
    {
      name: 'Savings & Investments',
      type: 'expense',
      categories: [
        { name: 'TFSA Contribution', icon: '🏦' },
        { name: 'RRSP Contribution', icon: '💰' },
        { name: 'Investment Purchase', icon: '📉' },
      ],
    },
    {
      name: 'Transfer',
      type: 'transfer',
      categories: [
        { name: 'Transfer', icon: '↔️' },
      ],
    },
  ];

  const categoryMap = new Map<string, string>();
  for (let gi = 0; gi < groupDefs.length; gi++) {
    const gd = groupDefs[gi];
    const group = await prisma.categoryGroup.create({
      data: {
        householdId: household.id,
        name: gd.name,
        type: gd.type,
        sortOrder: gi,
      },
    });
    for (let ci = 0; ci < gd.categories.length; ci++) {
      const cd = gd.categories[ci];
      const cat = await prisma.category.create({
        data: {
          householdId: household.id,
          name: cd.name,
          emoji: cd.icon,
          type: gd.type,
          groupId: group.id,
          sortOrder: ci,
        },
      });
      categoryMap.set(cd.name, cat.id);
    }
  }

  const catId = (name: string): string => {
    const id = categoryMap.get(name);
    if (!id) throw new Error(`Category not found: "${name}"`);
    return id;
  };

  // -------------------------------------------------------------------------
  // Transactions — Jan 1 2025 → Mar 20 2026
  // -------------------------------------------------------------------------

  const START = new Date('2025-01-01');
  const END = new Date('2026-03-20');

  // Canadian merchants
  const groceryMerchants  = ['Loblaws', 'No Frills', 'Sobeys', 'Metro', 'Costco Canada', 'Freshco', 'Food Basics', 'T&T Supermarket', 'Whole Foods Toronto'];
  const restaurantMerchants = ['Tim Hortons', 'Harvey\'s', 'Swiss Chalet', 'Boston Pizza', 'East Side Mario\'s', 'Kelsey\'s', 'The Keg', 'Montana\'s', 'Milestones', 'Earls Kitchen'];
  const coffeeMerchants   = ['Tim Hortons', 'Second Cup', 'Starbucks', 'Williams Coffee Pub', 'Dark Horse Espresso'];
  const takeoutMerchants  = ['DoorDash', 'SkipTheDishes', 'Uber Eats', 'Pizza Pizza', 'Little Caesars', 'Pita Pit'];
  const clothingMerchants = ['Roots', 'Lululemon', 'Aritzia', 'Reitmans', 'H&M Canada', 'Hudson\'s Bay', 'Sport Chek', 'Mark\'s'];
  const onlineMerchants   = ['Amazon.ca', 'Best Buy Canada', 'Staples Canada', 'Walmart Canada', 'Canadian Tire Online'];
  const gasMerchants      = ['Petro-Canada', 'Esso', 'Shell Canada', 'Ultramar', 'Sunoco Canada'];
  const transitMerchants  = ['TTC', 'Presto Card', 'OC Transpo', 'GO Transit', 'STM Montreal'];
  const entertainMerchants= ['Cineplex', 'Scotiabank Arena', 'Maple Leafs Game', 'Rogers Centre', 'TIFF Bell Lightbox'];
  const pharmacyMerchants = ['Shoppers Drug Mart', 'Rexall', 'Pharmasave', 'Costco Pharmacy'];
  const insuranceMerchants= ['Intact Insurance', 'TD Insurance', 'Desjardins', 'RBC Insurance'];

  // US/international merchants (20% of data)
  const usRestaurants     = ['Chipotle', 'McDonald\'s', 'Shake Shack', 'Panera Bread', 'Olive Garden'];
  const usGrocery         = ['Trader Joe\'s', 'Whole Foods', 'Safeway'];
  const usEntertain       = ['AMC Theatres', 'Ticketmaster', 'StubHub'];
  const usShopping        = ['Amazon.com', 'Target', 'Walmart.com', 'Best Buy'];

  interface TxInput {
    accountId: string;
    date: Date;
    description: string;
    amount: number;
    categoryId: string;
  }

  const txInputs: TxInput[] = [];

  // Build month list
  const months: Date[] = [];
  let cur = startOfMonth(START);
  while (cur <= END) {
    months.push(new Date(cur));
    cur = addMonths(cur, 1);
  }

  // Seasonal multipliers for realistic spending variation
  const seasonalSpend = (month: number): number => {
    // month 0-11
    const m = [0.85, 0.82, 0.90, 0.95, 1.0, 1.05, 1.15, 1.10, 0.95, 0.95, 1.30, 1.45];
    return m[month] ?? 1.0;
  };

  for (const monthStart of months) {
    const isPartial = monthStart.getFullYear() === END.getFullYear() && monthStart.getMonth() === END.getMonth();
    const monthEnd = isPartial ? END : new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const daysInRange = Math.max(1, Math.floor((monthEnd.getTime() - monthStart.getTime()) / 86_400_000) + 1);
    const seasonal = seasonalSpend(monthStart.getMonth());

    const dayOf = (d: number): Date => {
      return new Date(monthStart.getFullYear(), monthStart.getMonth(), Math.min(d, daysInRange));
    };
    const randDay = (): Date => {
      return new Date(monthStart.getFullYear(), monthStart.getMonth(), randomInt(1, daysInRange));
    };

    // ── Income ──────────────────────────────────────────────────────────────
    // Bi-weekly paycheque — 1st and 15th (net after tax, ~$4,800 CAD/paycheque)
    txInputs.push({ accountId: tdChecking.id, date: dayOf(1),  description: 'Direct Deposit - Synapse Technologies', amount:  4_820.00, categoryId: catId('Paycheques') });
    txInputs.push({ accountId: tdChecking.id, date: dayOf(15), description: 'Direct Deposit - Synapse Technologies', amount:  4_820.00, categoryId: catId('Paycheques') });

    // Occasional freelance (every 2-3 months)
    if (randomInt(1, 3) === 1) {
      txInputs.push({ accountId: tdChecking.id, date: randDay(), description: 'Freelance - Web Consulting', amount: randomBetween(800, 2_400), categoryId: catId('Freelance') });
    }

    // Dividends from investments (quarterly: Mar/Jun/Sep/Dec)
    if ([2, 5, 8, 11].includes(monthStart.getMonth())) {
      txInputs.push({ accountId: rbcSavings.id, date: dayOf(15), description: 'VCN.TO Dividend', amount: randomBetween(60, 110), categoryId: catId('Dividends') });
      txInputs.push({ accountId: rbcSavings.id, date: dayOf(16), description: 'XIC.TO Dividend',  amount: randomBetween(45, 90),  categoryId: catId('Dividends') });
      txInputs.push({ accountId: rbcSavings.id, date: dayOf(17), description: 'ZAG.TO Dividend',  amount: randomBetween(30, 55),  categoryId: catId('Dividends') });
    }

    // ── Housing ─────────────────────────────────────────────────────────────
    txInputs.push({ accountId: tdChecking.id, date: dayOf(1), description: 'Rent - 340 King St W', amount: -2_250.00, categoryId: catId('Rent/Mortgage') });

    // ── Hydro / Utilities ──────────────────────────────────────────────────
    txInputs.push({ accountId: tdChecking.id, date: dayOf(randomInt(5, 10)), description: 'Toronto Hydro', amount: -randomBetween(75, 160), categoryId: catId('Hydro') });

    // ── Internet ───────────────────────────────────────────────────────────
    txInputs.push({ accountId: tdChecking.id, date: dayOf(5), description: 'Bell Internet', amount: -89.95, categoryId: catId('Internet') });

    // ── Phone ──────────────────────────────────────────────────────────────
    txInputs.push({ accountId: tdChecking.id, date: dayOf(12), description: 'Rogers Wireless', amount: -65.00, categoryId: catId('Phone') });

    // ── Insurance ─────────────────────────────────────────────────────────
    txInputs.push({ accountId: tdChecking.id, date: dayOf(1), description: pick(insuranceMerchants), amount: -randomBetween(95, 130), categoryId: catId('Insurance') });

    // ── Subscriptions ─────────────────────────────────────────────────────
    txInputs.push({ accountId: scotiaVisa.id, date: dayOf(1),  description: 'Netflix Canada',         amount: -20.99, categoryId: catId('Subscriptions') });
    txInputs.push({ accountId: scotiaVisa.id, date: dayOf(1),  description: 'Spotify Canada',         amount: -11.99, categoryId: catId('Subscriptions') });
    txInputs.push({ accountId: scotiaVisa.id, date: dayOf(6),  description: 'Amazon Prime Canada',    amount: -9.99,  categoryId: catId('Subscriptions') });
    txInputs.push({ accountId: scotiaVisa.id, date: dayOf(8),  description: 'Crave TV',               amount: -19.99, categoryId: catId('Subscriptions') });
    if (maybe(0.7)) {
      txInputs.push({ accountId: scotiaVisa.id, date: dayOf(10), description: 'YouTube Premium',      amount: -13.99, categoryId: catId('Subscriptions') });
    }
    if (maybe(0.4)) {
      txInputs.push({ accountId: scotiaVisa.id, date: dayOf(14), description: 'Adobe Creative Cloud', amount: -89.99, categoryId: catId('Subscriptions') });
    }

    // ── Gym ────────────────────────────────────────────────────────────────
    txInputs.push({ accountId: tdChecking.id, date: dayOf(3), description: 'GoodLife Fitness', amount: -44.99, categoryId: catId('Gym') });

    // ── Groceries (4-6 trips) ──────────────────────────────────────────────
    const numGrocery = randomInt(4, 6);
    for (let i = 0; i < numGrocery; i++) {
      const isCA = maybe(0.85);
      txInputs.push({
        accountId: isCA ? scotiaVisa.id : scotiaVisa.id,
        date: randDay(),
        description: isCA ? pick(groceryMerchants) : pick(usGrocery),
        amount: -randomBetween(80, 260) * seasonal,
        categoryId: catId('Groceries'),
      });
    }

    // ── Restaurants (6-12) ─────────────────────────────────────────────────
    const numRestaurants = randomInt(6, 12);
    for (let i = 0; i < numRestaurants; i++) {
      const isCA = maybe(0.8);
      txInputs.push({
        accountId: scotiaVisa.id,
        date: randDay(),
        description: isCA ? pick(restaurantMerchants) : pick(usRestaurants),
        amount: -randomBetween(15, 95) * seasonal,
        categoryId: catId('Restaurants'),
      });
    }

    // ── Coffee (4-10) ─────────────────────────────────────────────────────
    const numCoffee = randomInt(4, 10);
    for (let i = 0; i < numCoffee; i++) {
      txInputs.push({ accountId: scotiaVisa.id, date: randDay(), description: pick(coffeeMerchants), amount: -randomBetween(3, 9), categoryId: catId('Coffee Shops') });
    }

    // ── Takeout & Delivery (2-6) ──────────────────────────────────────────
    const numTakeout = randomInt(2, 6);
    for (let i = 0; i < numTakeout; i++) {
      txInputs.push({ accountId: scotiaVisa.id, date: randDay(), description: pick(takeoutMerchants), amount: -randomBetween(18, 65), categoryId: catId('Takeout & Delivery') });
    }

    // ── Transit ───────────────────────────────────────────────────────────
    if (maybe(0.85)) {
      txInputs.push({ accountId: scotiaVisa.id, date: dayOf(randomInt(1, 5)), description: pick(transitMerchants), amount: -randomBetween(120, 160), categoryId: catId('TTC / Transit') });
    }

    // ── Gas (0-2) ─────────────────────────────────────────────────────────
    const numGas = randomInt(0, 2);
    for (let i = 0; i < numGas; i++) {
      txInputs.push({ accountId: scotiaVisa.id, date: randDay(), description: pick(gasMerchants), amount: -randomBetween(55, 110), categoryId: catId('Gas') });
    }

    // ── Shopping (1-4) ────────────────────────────────────────────────────
    const numShopping = randomInt(1, 4);
    for (let i = 0; i < numShopping; i++) {
      const r = rng();
      let desc: string; let cat: string;
      if (r < 0.40) { desc = 'Amazon.ca'; cat = 'Amazon'; }
      else if (r < 0.55) { desc = pick(onlineMerchants); cat = 'Online Shopping'; }
      else if (r < 0.70) { desc = pick(clothingMerchants); cat = 'Clothing'; }
      else if (r < 0.85) { desc = pick(usShopping); cat = 'Online Shopping'; }
      else { desc = 'Canadian Tire'; cat = 'Home & Garden'; }
      txInputs.push({ accountId: scotiaVisa.id, date: randDay(), description: desc, amount: -randomBetween(25, 350) * seasonal, categoryId: catId(cat) });
    }

    // ── Entertainment (0-3) ───────────────────────────────────────────────
    const numEntertain = randomInt(0, 3);
    for (let i = 0; i < numEntertain; i++) {
      const isCA = maybe(0.75);
      txInputs.push({
        accountId: scotiaVisa.id, date: randDay(),
        description: isCA ? pick(entertainMerchants) : pick(usEntertain),
        amount: -randomBetween(18, 120) * seasonal,
        categoryId: catId('Movies & TV'),
      });
    }

    // ── Pharmacy ──────────────────────────────────────────────────────────
    if (maybe(0.5)) {
      txInputs.push({ accountId: scotiaVisa.id, date: randDay(), description: pick(pharmacyMerchants), amount: -randomBetween(12, 80), categoryId: catId('Pharmacy') });
    }

    // ── Doctor / Dental ───────────────────────────────────────────────────
    if (maybe(0.25)) {
      txInputs.push({ accountId: tdChecking.id, date: randDay(), description: 'Toronto Dental Clinic', amount: -randomBetween(150, 400), categoryId: catId('Doctor / Dental') });
    }

    // ── Travel (occasional) ───────────────────────────────────────────────
    // Summer trip (July 2025)
    if (monthStart.getFullYear() === 2025 && monthStart.getMonth() === 6) {
      txInputs.push({ accountId: scotiaVisa.id, date: dayOf(5),  description: 'Air Canada - YYZ-LHR',    amount: -1_240.00, categoryId: catId('Flights') });
      txInputs.push({ accountId: scotiaVisa.id, date: dayOf(6),  description: 'Premier Inn London',       amount: -890.00,   categoryId: catId('Hotels') });
      txInputs.push({ accountId: scotiaVisa.id, date: dayOf(7),  description: 'Eurostar Paris',           amount: -310.00,   categoryId: catId('Flights') });
      txInputs.push({ accountId: scotiaVisa.id, date: dayOf(8),  description: 'Hotel De Paris',           amount: -760.00,   categoryId: catId('Hotels') });
      txInputs.push({ accountId: scotiaVisa.id, date: dayOf(14), description: 'Travel Insurance - IG',   amount: -220.00,   categoryId: catId('Travel Insurance') });
    }
    // March Break 2026
    if (monthStart.getFullYear() === 2026 && monthStart.getMonth() === 2) {
      txInputs.push({ accountId: scotiaVisa.id, date: dayOf(8),  description: 'WestJet - YYZ-CUN',       amount: -1_080.00, categoryId: catId('Flights') });
      txInputs.push({ accountId: scotiaVisa.id, date: dayOf(9),  description: 'Barcelo Maya Grand',       amount: -2_100.00, categoryId: catId('Hotels') });
    }
    // Weekend trip to Montreal (September 2025)
    if (monthStart.getFullYear() === 2025 && monthStart.getMonth() === 8) {
      txInputs.push({ accountId: scotiaVisa.id, date: dayOf(12), description: 'Via Rail - YYZ-MTL',      amount: -145.00,   categoryId: catId('Flights') });
      txInputs.push({ accountId: scotiaVisa.id, date: dayOf(12), description: 'Le Germain Montreal',      amount: -380.00,   categoryId: catId('Hotels') });
    }

    // ── Education (occasional) ────────────────────────────────────────────
    if (maybe(0.2)) {
      txInputs.push({ accountId: scotiaVisa.id, date: randDay(), description: 'Udemy Course', amount: -randomBetween(15, 45), categoryId: catId('Books & Courses') });
    }
    if (maybe(0.1)) {
      txInputs.push({ accountId: tdChecking.id, date: randDay(), description: 'CPA Canada Exam Fee', amount: -520.00, categoryId: catId('Professional Development') });
    }

    // ── TFSA Contribution (monthly) ────────────────────────────────────────
    txInputs.push({ accountId: rbcSavings.id, date: dayOf(20), description: 'Transfer to Questrade TFSA', amount: -500.00, categoryId: catId('TFSA Contribution') });

    // ── RRSP Contribution (Jan-Feb heavy, smaller rest of year) ────────────
    if ([0, 1].includes(monthStart.getMonth())) {
      txInputs.push({ accountId: tdChecking.id, date: dayOf(28), description: 'RRSP Contribution - Wealthsimple', amount: -2_500.00, categoryId: catId('RRSP Contribution') });
    } else if (maybe(0.4)) {
      txInputs.push({ accountId: tdChecking.id, date: dayOf(25), description: 'RRSP Contribution - Wealthsimple', amount: -500.00, categoryId: catId('RRSP Contribution') });
    }

    // ── Car maintenance (occasional) ──────────────────────────────────────
    if (maybe(0.2)) {
      txInputs.push({ accountId: tdChecking.id, date: randDay(), description: pick(['Mr. Lube', 'Active Green+Ross', 'Kal Tire']), amount: -randomBetween(80, 300), categoryId: catId('Car Maintenance') });
    }
  }

  // ── Special one-off transactions ──────────────────────────────────────────

  // Tax refund (April 2025)
  txInputs.push({ accountId: tdChecking.id, date: new Date('2025-04-15'), description: 'CRA Tax Refund', amount: 3_820.00, categoryId: catId('Other Income') });

  // MacBook Pro purchase (Feb 2025)
  txInputs.push({ accountId: scotiaVisa.id, date: new Date('2025-02-14'), description: 'Apple Store - MacBook Pro', amount: -2_899.00, categoryId: catId('Electronics') });

  // Home office setup (Jan 2025)
  txInputs.push({ accountId: scotiaVisa.id, date: new Date('2025-01-18'), description: 'IKEA Canada', amount: -485.00, categoryId: catId('Home & Garden') });
  txInputs.push({ accountId: scotiaVisa.id, date: new Date('2025-01-19'), description: 'Best Buy Canada - Monitor', amount: -649.00, categoryId: catId('Electronics') });

  // Sports event (Jan 2025)
  txInputs.push({ accountId: scotiaVisa.id, date: new Date('2025-01-22'), description: 'Raptors vs Celtics', amount: -185.00, categoryId: catId('Sports') });

  // Concert (June 2025)
  txInputs.push({ accountId: scotiaVisa.id, date: new Date('2025-06-15'), description: 'Ticketmaster - Drake Concert', amount: -280.00, categoryId: catId('Events & Concerts') });

  // Lululemon purchase (Mar 2025)
  txInputs.push({ accountId: scotiaVisa.id, date: new Date('2025-03-08'), description: 'Lululemon', amount: -328.00, categoryId: catId('Clothing') });

  // Boxing Day deals (Dec 2025)
  txInputs.push({ accountId: scotiaVisa.id, date: new Date('2025-12-26'), description: 'Best Buy Canada - TV', amount: -1_199.00, categoryId: catId('Electronics') });
  txInputs.push({ accountId: scotiaVisa.id, date: new Date('2025-12-27'), description: 'Sport Chek', amount: -240.00, categoryId: catId('Clothing') });

  // Mental health (occasional)
  txInputs.push({ accountId: tdChecking.id, date: new Date('2025-03-20'), description: 'Therapy Session', amount: -150.00, categoryId: catId('Mental Health') });
  txInputs.push({ accountId: tdChecking.id, date: new Date('2025-06-20'), description: 'Therapy Session', amount: -150.00, categoryId: catId('Mental Health') });
  txInputs.push({ accountId: tdChecking.id, date: new Date('2025-09-20'), description: 'Therapy Session', amount: -150.00, categoryId: catId('Mental Health') });
  txInputs.push({ accountId: tdChecking.id, date: new Date('2025-12-10'), description: 'Therapy Session', amount: -150.00, categoryId: catId('Mental Health') });

  console.log(`Creating ${txInputs.length} transactions…`);

  const createdTransactions = await Promise.all(
    txInputs.map((tx) =>
      prisma.transaction.create({
        data: {
          householdId: household.id,
          accountId: tx.accountId,
          date: tx.date,
          description: tx.description,
          originalDescription: tx.description,
          amount: roundCents(tx.amount),
          categoryId: tx.categoryId,
        },
      }),
    ),
  );

  console.log(`Created ${createdTransactions.length} transactions.`);

  // -------------------------------------------------------------------------
  // Investment Holdings + Lots (TFSA — Canadian-heavy, RRSP, US brokerage)
  // -------------------------------------------------------------------------

  interface LotDef { date: string; shares: number; price: number; note?: string }
  interface HoldingDef {
    accountId: string;
    symbol: string;
    name: string;
    assetClass: string;
    currentPrice: number;
    lots: LotDef[];
  }

  const holdingDefs: HoldingDef[] = [

    // ── TFSA: Canadian ETFs & Stocks ────────────────────────────────────────

    {
      accountId: tfsaAccount.id,
      symbol: 'VCN.TO',
      name: 'Vanguard FTSE Canada All Cap Index ETF',
      assetClass: 'ca_stock',
      currentPrice: 46.82,
      lots: [
        { date: '2025-01-15', shares: 50, price: 41.20, note: 'Initial TFSA purchase' },
        { date: '2025-02-15', shares: 25, price: 42.10, note: 'Monthly DCA' },
        { date: '2025-03-15', shares: 25, price: 43.50 },
        { date: '2025-04-15', shares: 30, price: 43.80 },
        { date: '2025-05-15', shares: 25, price: 44.20 },
        { date: '2025-06-15', shares: 20, price: 44.90 },
        { date: '2025-07-15', shares: 20, price: 45.10 },
        { date: '2025-08-15', shares: 20, price: 45.50 },
        { date: '2025-09-15', shares: 25, price: 44.80 },
        { date: '2025-10-15', shares: 20, price: 45.20 },
        { date: '2025-11-15', shares: 20, price: 45.80 },
        { date: '2025-12-15', shares: 25, price: 46.10 },
        { date: '2026-01-15', shares: 20, price: 46.40 },
        { date: '2026-02-15', shares: 20, price: 46.60 },
        { date: '2026-03-15', shares: 15, price: 46.82 },
      ],
    },

    {
      accountId: tfsaAccount.id,
      symbol: 'XIC.TO',
      name: 'iShares S&P/TSX Capped Composite Index ETF',
      assetClass: 'ca_stock',
      currentPrice: 38.54,
      lots: [
        { date: '2025-01-20', shares: 60, price: 33.40, note: 'Initial purchase' },
        { date: '2025-04-20', shares: 40, price: 35.10 },
        { date: '2025-07-20', shares: 40, price: 36.80 },
        { date: '2025-10-20', shares: 40, price: 37.50 },
        { date: '2026-01-20', shares: 30, price: 38.20 },
      ],
    },

    {
      accountId: tfsaAccount.id,
      symbol: 'ZAG.TO',
      name: 'BMO Aggregate Bond Index ETF',
      assetClass: 'bond',
      currentPrice: 14.82,
      lots: [
        { date: '2025-01-25', shares: 100, price: 14.20, note: 'Fixed income allocation' },
        { date: '2025-04-25', shares:  50, price: 14.35 },
        { date: '2025-07-25', shares:  50, price: 14.55 },
        { date: '2025-10-25', shares:  50, price: 14.70 },
        { date: '2026-01-25', shares:  30, price: 14.75 },
      ],
    },

    {
      accountId: tfsaAccount.id,
      symbol: 'RY.TO',
      name: 'Royal Bank of Canada',
      assetClass: 'ca_stock',
      currentPrice: 148.25,
      lots: [
        { date: '2025-02-01', shares: 10, price: 128.50, note: 'Big 5 bank position' },
        { date: '2025-05-01', shares:  8, price: 135.20 },
        { date: '2025-08-01', shares:  7, price: 140.80 },
        { date: '2025-11-01', shares:  5, price: 145.30 },
      ],
    },

    {
      accountId: tfsaAccount.id,
      symbol: 'TD.TO',
      name: 'Toronto-Dominion Bank',
      assetClass: 'ca_stock',
      currentPrice: 84.60,
      lots: [
        { date: '2025-02-10', shares: 15, price: 76.40, note: 'Big 5 bank position' },
        { date: '2025-05-10', shares: 12, price: 79.20 },
        { date: '2025-08-10', shares: 10, price: 81.50 },
        { date: '2025-11-10', shares:  8, price: 83.20 },
      ],
    },

    {
      accountId: tfsaAccount.id,
      symbol: 'ENB.TO',
      name: 'Enbridge Inc',
      assetClass: 'ca_stock',
      currentPrice: 57.40,
      lots: [
        { date: '2025-03-01', shares: 25, price: 49.80, note: 'Energy/dividend play' },
        { date: '2025-06-01', shares: 20, price: 52.10 },
        { date: '2025-09-01', shares: 15, price: 54.80 },
        { date: '2025-12-01', shares: 10, price: 56.20 },
      ],
    },

    {
      accountId: tfsaAccount.id,
      symbol: 'SU.TO',
      name: 'Suncor Energy Inc',
      assetClass: 'ca_stock',
      currentPrice: 56.80,
      lots: [
        { date: '2025-03-15', shares: 20, price: 48.20 },
        { date: '2025-06-15', shares: 15, price: 51.40 },
        { date: '2025-09-15', shares: 10, price: 54.60 },
      ],
    },

    {
      accountId: tfsaAccount.id,
      symbol: 'SHOP.TO',
      name: 'Shopify Inc',
      assetClass: 'ca_stock',
      currentPrice: 128.40,
      lots: [
        { date: '2025-01-10', shares: 8, price: 108.20, note: 'Canadian tech growth' },
        { date: '2025-04-10', shares: 5, price: 115.80 },
        { date: '2025-07-10', shares: 4, price: 120.40 },
        { date: '2025-10-10', shares: 3, price: 124.60 },
      ],
    },

    {
      accountId: tfsaAccount.id,
      symbol: 'BCE.TO',
      name: 'BCE Inc',
      assetClass: 'ca_stock',
      currentPrice: 34.80,
      lots: [
        { date: '2025-04-05', shares: 30, price: 31.20, note: 'Telecom dividend stock' },
        { date: '2025-07-05', shares: 20, price: 32.80 },
        { date: '2025-10-05', shares: 15, price: 33.90 },
      ],
    },

    // Canadian Mutual Fund (TFSA)
    {
      accountId: tfsaAccount.id,
      symbol: 'RBF460',
      name: 'RBC Canadian Dividend Fund',
      assetClass: 'mutual_fund',
      currentPrice: 22.48,
      lots: [
        { date: '2025-01-31', shares: 100, price: 19.80, note: 'Mutual fund - monthly contribution' },
        { date: '2025-02-28', shares:  50, price: 20.10 },
        { date: '2025-03-31', shares:  50, price: 20.50 },
        { date: '2025-04-30', shares:  50, price: 20.90 },
        { date: '2025-05-31', shares:  50, price: 21.20 },
        { date: '2025-06-30', shares:  40, price: 21.60 },
        { date: '2025-07-31', shares:  40, price: 21.90 },
        { date: '2025-08-31', shares:  40, price: 22.10 },
        { date: '2025-09-30', shares:  40, price: 21.80 },
        { date: '2025-10-31', shares:  40, price: 22.00 },
        { date: '2025-11-30', shares:  40, price: 22.25 },
        { date: '2025-12-31', shares:  40, price: 22.40 },
        { date: '2026-01-31', shares:  30, price: 22.42 },
        { date: '2026-02-28', shares:  30, price: 22.45 },
      ],
    },

    // ── RRSP: Diversified Global ─────────────────────────────────────────────

    {
      accountId: rrspAccount.id,
      symbol: 'XEQT.TO',
      name: 'iShares Core Equity ETF Portfolio',
      assetClass: 'ca_stock',
      currentPrice: 32.85,
      lots: [
        { date: '2025-01-28', shares: 150, price: 28.40, note: 'RRSP - core equity' },
        { date: '2025-02-28', shares:  80, price: 29.10 },
        { date: '2025-03-31', shares:  60, price: 29.80 },
        { date: '2025-06-30', shares:  60, price: 30.50 },
        { date: '2025-09-30', shares:  50, price: 31.20 },
        { date: '2025-12-31', shares:  50, price: 31.90 },
        { date: '2026-01-28', shares:  40, price: 32.40 },
        { date: '2026-02-28', shares:  30, price: 32.70 },
      ],
    },

    {
      accountId: rrspAccount.id,
      symbol: 'VFV.TO',
      name: 'Vanguard S&P 500 Index ETF (CAD-Hedged)',
      assetClass: 'us_stock',
      currentPrice: 118.60,
      lots: [
        { date: '2025-01-28', shares: 40, price: 101.20, note: 'US exposure via RRSP' },
        { date: '2025-04-28', shares: 25, price: 108.40 },
        { date: '2025-07-28', shares: 20, price: 112.80 },
        { date: '2025-10-28', shares: 15, price: 115.60 },
        { date: '2026-01-28', shares: 10, price: 117.80 },
      ],
    },

    {
      accountId: rrspAccount.id,
      symbol: 'ZEM.TO',
      name: 'BMO MSCI Emerging Markets Index ETF',
      assetClass: 'international_stock',
      currentPrice: 24.10,
      lots: [
        { date: '2025-02-15', shares: 80, price: 21.80 },
        { date: '2025-05-15', shares: 50, price: 22.40 },
        { date: '2025-08-15', shares: 40, price: 23.20 },
        { date: '2025-11-15', shares: 30, price: 23.80 },
      ],
    },

    // Canadian Mutual Fund (RRSP)
    {
      accountId: rrspAccount.id,
      symbol: 'TDB902',
      name: 'TD Canadian Index Fund - e',
      assetClass: 'mutual_fund',
      currentPrice: 138.40,
      lots: [
        { date: '2025-01-31', shares: 20, price: 118.50, note: 'Low-cost index mutual fund' },
        { date: '2025-02-28', shares: 10, price: 120.80 },
        { date: '2025-03-31', shares: 10, price: 124.20 },
        { date: '2025-06-30', shares: 10, price: 128.60 },
        { date: '2025-09-30', shares:  8, price: 132.40 },
        { date: '2025-12-31', shares:  8, price: 135.20 },
        { date: '2026-01-31', shares:  5, price: 136.80 },
        { date: '2026-02-28', shares:  5, price: 137.60 },
      ],
    },

    {
      accountId: rrspAccount.id,
      symbol: 'MFC.TO',
      name: 'Manulife Financial Corporation',
      assetClass: 'ca_stock',
      currentPrice: 42.80,
      lots: [
        { date: '2025-03-01', shares: 30, price: 35.40 },
        { date: '2025-06-01', shares: 20, price: 37.80 },
        { date: '2025-09-01', shares: 15, price: 40.20 },
        { date: '2025-12-01', shares: 10, price: 41.60 },
      ],
    },

    // ── US Brokerage: US Stocks & ETFs (20% of portfolio) ───────────────────

    {
      accountId: usInvestAccount.id,
      symbol: 'VTI',
      name: 'Vanguard Total Stock Market ETF',
      assetClass: 'us_stock',
      currentPrice: 248.60,
      lots: [
        { date: '2025-01-10', shares: 15, price: 218.40, note: 'US total market' },
        { date: '2025-04-10', shares: 10, price: 228.60 },
        { date: '2025-07-10', shares:  8, price: 235.80 },
        { date: '2025-10-10', shares:  7, price: 241.20 },
        { date: '2026-01-10', shares:  5, price: 245.80 },
      ],
    },

    {
      accountId: usInvestAccount.id,
      symbol: 'AAPL',
      name: 'Apple Inc',
      assetClass: 'us_stock',
      currentPrice: 228.50,
      lots: [
        { date: '2025-01-15', shares: 10, price: 182.40 },
        { date: '2025-04-15', shares:  5, price: 195.20 },
        { date: '2025-07-15', shares:  5, price: 210.80 },
        { date: '2025-10-15', shares:  3, price: 222.60 },
      ],
    },

    {
      accountId: usInvestAccount.id,
      symbol: 'MSFT',
      name: 'Microsoft Corporation',
      assetClass: 'us_stock',
      currentPrice: 420.80,
      lots: [
        { date: '2025-01-20', shares: 5, price: 368.40 },
        { date: '2025-05-20', shares: 3, price: 388.20 },
        { date: '2025-09-20', shares: 2, price: 405.60 },
      ],
    },

    {
      accountId: usInvestAccount.id,
      symbol: 'QQQ',
      name: 'Invesco QQQ Trust (NASDAQ-100)',
      assetClass: 'us_stock',
      currentPrice: 488.20,
      lots: [
        { date: '2025-02-01', shares: 8, price: 438.60, note: 'Tech exposure' },
        { date: '2025-05-01', shares: 5, price: 455.80 },
        { date: '2025-08-01', shares: 3, price: 470.40 },
        { date: '2025-11-01', shares: 2, price: 482.20 },
      ],
    },

    {
      accountId: usInvestAccount.id,
      symbol: 'NVDA',
      name: 'NVIDIA Corporation',
      assetClass: 'us_stock',
      currentPrice: 138.40,
      lots: [
        { date: '2025-01-25', shares: 12, price: 98.20, note: 'AI chip play' },
        { date: '2025-04-25', shares:  8, price: 108.60 },
        { date: '2025-07-25', shares:  6, price: 118.40 },
        { date: '2025-10-25', shares:  4, price: 128.80 },
      ],
    },

    {
      accountId: usInvestAccount.id,
      symbol: 'BND',
      name: 'Vanguard Total Bond Market ETF',
      assetClass: 'bond',
      currentPrice: 74.80,
      lots: [
        { date: '2025-02-15', shares: 20, price: 72.40 },
        { date: '2025-05-15', shares: 15, price: 73.20 },
        { date: '2025-08-15', shares: 10, price: 73.80 },
        { date: '2025-11-15', shares: 10, price: 74.40 },
      ],
    },

    // US Mutual Fund
    {
      accountId: usInvestAccount.id,
      symbol: 'VFIAX',
      name: 'Vanguard 500 Index Fund Admiral Shares',
      assetClass: 'mutual_fund',
      currentPrice: 528.40,
      lots: [
        { date: '2025-01-31', shares: 5, price: 468.40, note: 'US mutual fund - monthly' },
        { date: '2025-02-28', shares: 3, price: 478.20 },
        { date: '2025-03-31', shares: 3, price: 488.60 },
        { date: '2025-06-30', shares: 2, price: 500.80 },
        { date: '2025-09-30', shares: 2, price: 512.40 },
        { date: '2025-12-31', shares: 2, price: 522.60 },
        { date: '2026-01-31', shares: 1, price: 525.80 },
        { date: '2026-02-28', shares: 1, price: 527.40 },
      ],
    },
  ];

  console.log(`Creating ${holdingDefs.length} investment holdings with lots…`);

  for (const hd of holdingDefs) {
    // Compute average cost basis from lots
    const totalShares = hd.lots.reduce((s, l) => s + l.shares, 0);
    const totalCost   = hd.lots.reduce((s, l) => s + l.shares * l.price, 0);
    const avgCost     = totalShares > 0 ? totalCost / totalShares : hd.currentPrice;

    const holding = await prisma.investmentHolding.create({
      data: {
        accountId:    hd.accountId,
        symbol:       hd.symbol,
        name:         hd.name,
        shares:       totalShares,
        costBasis:    roundCents(avgCost),
        currentPrice: hd.currentPrice,
        assetClass:   hd.assetClass,
      },
    });

    await prisma.holdingLot.createMany({
      data: hd.lots.map((l) => ({
        holdingId:    holding.id,
        date:         new Date(l.date),
        shares:       l.shares,
        pricePerShare: l.price,
        note:         l.note ?? null,
        status:       'confirmed',
      })),
    });
  }

  // Recurring investments (monthly DCA on core positions)
  // We'll look up the VCN.TO and XEQT.TO holdings to attach schedules
  const vcnHolding  = await prisma.investmentHolding.findFirst({ where: { accountId: tfsaAccount.id,  symbol: 'VCN.TO'  } });
  const xeqtHolding = await prisma.investmentHolding.findFirst({ where: { accountId: rrspAccount.id,  symbol: 'XEQT.TO' } });
  const vtiHolding  = await prisma.investmentHolding.findFirst({ where: { accountId: usInvestAccount.id, symbol: 'VTI' } });

  const nextRun = new Date('2026-04-15');

  if (vcnHolding) {
    await prisma.recurringInvestment.create({
      data: {
        holdingId:  vcnHolding.id,
        amount:     500,
        frequency:  'monthly',
        dayOfMonth: 15,
        status:     'active',
        lastRunAt:  new Date('2026-03-15'),
        nextRunAt:  nextRun,
      },
    });
  }
  if (xeqtHolding) {
    await prisma.recurringInvestment.create({
      data: {
        holdingId:  xeqtHolding.id,
        amount:     400,
        frequency:  'monthly',
        dayOfMonth: 28,
        status:     'active',
        lastRunAt:  new Date('2026-02-28'),
        nextRunAt:  new Date('2026-03-28'),
      },
    });
  }
  if (vtiHolding) {
    await prisma.recurringInvestment.create({
      data: {
        holdingId:  vtiHolding.id,
        amount:     300,
        frequency:  'monthly',
        dayOfMonth: 10,
        status:     'active',
        lastRunAt:  new Date('2026-03-10'),
        nextRunAt:  new Date('2026-04-10'),
      },
    });
  }

  // -------------------------------------------------------------------------
  // Budgets — current month (CAD-calibrated)
  // -------------------------------------------------------------------------

  const budgetDefs: Array<{ category: string; amount: number }> = [
    { category: 'Groceries',            amount: 800 },
    { category: 'Restaurants',          amount: 500 },
    { category: 'Coffee Shops',         amount: 80 },
    { category: 'Takeout & Delivery',   amount: 200 },
    { category: 'Rent/Mortgage',        amount: 2250 },
    { category: 'Hydro',                amount: 150 },
    { category: 'Internet',             amount: 90 },
    { category: 'Phone',                amount: 65 },
    { category: 'Subscriptions',        amount: 100 },
    { category: 'Insurance',            amount: 130 },
    { category: 'Gym',                  amount: 50 },
    { category: 'Amazon',               amount: 150 },
    { category: 'Online Shopping',      amount: 200 },
    { category: 'Clothing',             amount: 200 },
    { category: 'Gas',                  amount: 120 },
    { category: 'TTC / Transit',        amount: 160 },
    { category: 'Movies & TV',          amount: 100 },
    { category: 'Pharmacy',             amount: 50 },
    { category: 'TFSA Contribution',    amount: 500 },
    { category: 'RRSP Contribution',    amount: 500 },
  ];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.budget.createMany({
    data: budgetDefs.map((bd) => ({
      householdId: household.id,
      categoryId:  catId(bd.category),
      amount:      bd.amount,
      period:      'monthly',
      startDate:   startOfMonth(today),
    })),
  });

  // -------------------------------------------------------------------------
  // Recurring Items
  // -------------------------------------------------------------------------

  const nextMonth1st = startOfMonth(addMonths(today, 1));
  const nextMonth12  = new Date(nextMonth1st.getFullYear(), nextMonth1st.getMonth(), 12);
  const nextMonth5   = new Date(nextMonth1st.getFullYear(), nextMonth1st.getMonth(), 5);

  await prisma.recurringItem.createMany({
    data: [
      { householdId: household.id, name: 'Netflix Canada',      amount: -20.99, frequency: 'monthly', nextDate: nextMonth1st, accountId: scotiaVisa.id,  categoryId: catId('Subscriptions'), isAutopay: true, isActive: true },
      { householdId: household.id, name: 'Spotify Canada',      amount: -11.99, frequency: 'monthly', nextDate: nextMonth1st, accountId: scotiaVisa.id,  categoryId: catId('Subscriptions'), isAutopay: true, isActive: true },
      { householdId: household.id, name: 'Amazon Prime Canada', amount: -9.99,  frequency: 'monthly', nextDate: nextMonth1st, accountId: scotiaVisa.id,  categoryId: catId('Subscriptions'), isAutopay: true, isActive: true },
      { householdId: household.id, name: 'Crave TV',            amount: -19.99, frequency: 'monthly', nextDate: nextMonth1st, accountId: scotiaVisa.id,  categoryId: catId('Subscriptions'), isAutopay: true, isActive: true },
      { householdId: household.id, name: 'GoodLife Fitness',    amount: -44.99, frequency: 'monthly', nextDate: nextMonth1st, accountId: tdChecking.id,  categoryId: catId('Gym'),           isAutopay: true, isActive: true },
      { householdId: household.id, name: 'Bell Internet',       amount: -89.95, frequency: 'monthly', nextDate: nextMonth5,  accountId: tdChecking.id,  categoryId: catId('Internet'),      isAutopay: false, isActive: true },
      { householdId: household.id, name: 'Rogers Wireless',     amount: -65.00, frequency: 'monthly', nextDate: nextMonth12, accountId: tdChecking.id,  categoryId: catId('Phone'),         isAutopay: false, isActive: true },
      { householdId: household.id, name: 'Rent - 340 King St W', amount: -2250, frequency: 'monthly', nextDate: nextMonth1st, accountId: tdChecking.id, categoryId: catId('Rent/Mortgage'), isAutopay: false, isActive: true },
    ],
  });

  // -------------------------------------------------------------------------
  // Goals
  // -------------------------------------------------------------------------

  await prisma.goal.createMany({
    data: [
      {
        householdId: household.id,
        name: 'Emergency Fund (6 months)',
        type: 'savings',
        targetAmount: 30_000,
        currentAmount: 14_880,
        targetDate: addMonths(today, 12),
        accountId: rbcSavings.id,
        icon: 'shield',
      },
      {
        householdId: household.id,
        name: 'Home Down Payment',
        type: 'savings',
        targetAmount: 120_000,
        currentAmount: 38_400,
        targetDate: addMonths(today, 36),
        icon: 'home',
      },
      {
        householdId: household.id,
        name: 'Europe Trip 2026',
        type: 'savings',
        targetAmount: 8_000,
        currentAmount: 3_200,
        targetDate: new Date('2026-06-01'),
        icon: 'plane',
      },
      {
        householdId: household.id,
        name: 'New Car (2027)',
        type: 'savings',
        targetAmount: 25_000,
        currentAmount: 6_500,
        targetDate: new Date('2027-01-01'),
        icon: 'car',
      },
    ],
  });

  // -------------------------------------------------------------------------
  // Tags
  // -------------------------------------------------------------------------

  await prisma.tag.createMany({
    data: [
      { householdId: household.id, name: 'Business',       color: '#1971c2' },
      { householdId: household.id, name: 'Reimbursable',   color: '#2f9e44' },
      { householdId: household.id, name: 'Tax Deductible', color: '#e67700' },
      { householdId: household.id, name: 'Joint',          color: '#7950f2' },
      { householdId: household.id, name: 'RRSP Receipt',   color: '#f03e3e' },
      { householdId: household.id, name: 'TFSA',           color: '#0c8599' },
    ],
  });

  // -------------------------------------------------------------------------
  // Rules
  // -------------------------------------------------------------------------

  await prisma.rule.createMany({
    data: [
      {
        householdId: household.id,
        conditions: [{ field: 'merchant', operator: 'contains', value: 'Tim Hortons' }],
        actions:    [{ type: 'set_category', categoryId: catId('Coffee Shops') }],
        sortOrder: 0, isActive: true,
      },
      {
        householdId: household.id,
        conditions: [{ field: 'merchant', operator: 'contains', value: 'Amazon' }],
        actions:    [{ type: 'set_category', categoryId: catId('Amazon') }],
        sortOrder: 1, isActive: true,
      },
      {
        householdId: household.id,
        conditions: [{ field: 'merchant', operator: 'contains', value: 'Loblaws' }],
        actions:    [{ type: 'set_category', categoryId: catId('Groceries') }],
        sortOrder: 2, isActive: true,
      },
      {
        householdId: household.id,
        conditions: [{ field: 'merchant', operator: 'contains', value: 'Petro-Canada' }],
        actions:    [{ type: 'set_category', categoryId: catId('Gas') }],
        sortOrder: 3, isActive: true,
      },
      {
        householdId: household.id,
        conditions: [{ field: 'merchant', operator: 'contains', value: 'Shoppers' }],
        actions:    [{ type: 'set_category', categoryId: catId('Pharmacy') }],
        sortOrder: 4, isActive: true,
      },
      {
        householdId: household.id,
        conditions: [{ field: 'amount', operator: 'greater_than', value: '500' }],
        actions:    [{ type: 'flag_review' }],
        sortOrder: 5, isActive: true,
      },
    ],
  });

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  const holdingCount = await prisma.investmentHolding.count();
  const lotCount     = await prisma.holdingLot.count();

  // Advice library
  await seedAdviceTopics();

  console.log('\nSeed complete ✓');
  console.log(`  User:            demo@kuber.app / password123`);
  console.log(`  Household:       ${household.name} (CAD-primary)`);
  console.log(`  Accounts:        TD Chequing · RBC Savings · Scotia Visa · Questrade TFSA · Wealthsimple RRSP · Fidelity US`);
  console.log(`  Transactions:    ${createdTransactions.length}  (Jan 2025 – Mar 2026)`);
  console.log(`  Categories:      ${categoryMap.size} across ${groupDefs.length} groups`);
  console.log(`  Holdings:        ${holdingCount}  (${lotCount} lots)`);
  console.log(`  Budgets:         ${budgetDefs.length}`);
  console.log(`  Goals:           4`);
}

// ---------------------------------------------------------------------------
// Advice Library seed
// ---------------------------------------------------------------------------

async function seedAdviceTopics() {
  const topics = [
    {
      slug: 'emergency-fund',
      title: 'Build an Emergency Fund',
      description: 'Protect yourself from unexpected expenses with 3–6 months of living costs set aside in a dedicated savings account.',
      category: 'save',
      icon: '🛡️',
      sortOrder: 1,
      tasks: [
        { title: 'Calculate your monthly expenses', description: 'Add up all essential monthly costs: rent/mortgage, groceries, utilities, transportation, and insurance.', sortOrder: 1 },
        { title: 'Open a dedicated savings account', description: 'Keep your emergency fund separate from day-to-day spending to avoid temptation.', sortOrder: 2 },
        { title: 'Set up automatic transfers', description: 'Automate a fixed amount to transfer on each payday so saving happens without effort.', sortOrder: 3 },
        { title: 'Reach 1 month of expenses', description: 'Hit your first milestone — one full month of essential expenses saved.', sortOrder: 4 },
        { title: 'Build to 3 months', description: 'Continue saving until you have three months of expenses covered.', sortOrder: 5 },
        { title: 'Build to 6 months', description: 'Reach full financial security with six months of expenses in reserve.', sortOrder: 6 },
      ],
    },
    {
      slug: 'build-budget',
      title: 'Build a Budget',
      description: 'Take control of your money by understanding exactly what comes in, what goes out, and where you want it to go.',
      category: 'spend',
      icon: '📊',
      sortOrder: 2,
      tasks: [
        { title: 'Track your income sources', description: 'List all income: salary, freelance, side income, and any passive sources.', sortOrder: 1 },
        { title: 'List all fixed expenses', description: 'Identify recurring costs that do not change month to month such as rent, loan payments, and subscriptions.', sortOrder: 2 },
        { title: 'Identify variable expenses', description: 'Review 2–3 months of transactions to find spending that varies: groceries, dining, entertainment.', sortOrder: 3 },
        { title: 'Set spending limits by category', description: 'Assign a realistic monthly limit to each spending category based on your income and goals.', sortOrder: 4 },
        { title: 'Review your first month', description: 'Compare actual spending against your budget at month end and note any problem areas.', sortOrder: 5 },
        { title: 'Adjust and refine', description: 'Tweak category limits to be both realistic and challenging. A budget improves with iteration.', sortOrder: 6 },
      ],
    },
    {
      slug: 'pay-off-debt',
      title: 'Pay Off Debt',
      description: 'Eliminate high-interest debt systematically so you can stop paying interest and start building wealth.',
      category: 'pay-down',
      icon: '💳',
      sortOrder: 3,
      tasks: [
        { title: 'List all your debts with interest rates', description: 'Write down every debt: balance, minimum payment, and interest rate.', sortOrder: 1 },
        { title: 'Choose a payoff strategy (avalanche or snowball)', description: 'Avalanche targets the highest interest rate first (saves the most money). Snowball targets the smallest balance first (fastest wins).', sortOrder: 2 },
        { title: 'Make minimum payments on all debts', description: 'Always meet minimums to avoid penalties and protect your credit score.', sortOrder: 3 },
        { title: 'Put extra money toward your target debt', description: 'Any surplus income beyond minimums should go to your priority debt.', sortOrder: 4 },
        { title: 'Celebrate each debt paid off', description: 'Acknowledge the milestone — it keeps you motivated for the next one.', sortOrder: 5 },
        { title: 'Redirect payments to next debt', description: 'Once a debt is cleared, roll its payment amount into attacking the next target.', sortOrder: 6 },
      ],
    },
    {
      slug: 'start-investing',
      title: 'Start Investing',
      description: 'Put your money to work for the long term through tax-advantaged accounts and low-cost index funds.',
      category: 'invest',
      icon: '📈',
      sortOrder: 4,
      tasks: [
        { title: 'Understand your investment timeline', description: 'Longer timelines (10+ years) allow for more equity exposure. Shorter timelines require more conservative allocations.', sortOrder: 1 },
        { title: 'Open a tax-advantaged account (RRSP/TFSA or 401k/IRA)', description: 'Maximize tax benefits by investing inside registered or tax-deferred accounts before using taxable ones.', sortOrder: 2 },
        { title: 'Choose a simple index fund strategy', description: 'A low-cost broad-market index fund (e.g. XEQT, VTI/VXUS, or an all-in-one ETF) beats most active strategies over time.', sortOrder: 3 },
        { title: 'Set up automatic contributions', description: 'Automate monthly contributions so you invest consistently regardless of market conditions.', sortOrder: 4 },
        { title: 'Review your portfolio annually', description: 'Check once a year to rebalance if allocations have drifted and confirm contributions are on track.', sortOrder: 5 },
        { title: 'Increase contributions over time', description: 'Raise your contribution rate whenever you get a raise, bonus, or reduce an expense.', sortOrder: 6 },
      ],
    },
    {
      slug: 'buy-home',
      title: 'Buy a Home',
      description: 'Navigate the home-buying process from credit check to closing day with confidence.',
      category: 'save',
      icon: '🏠',
      sortOrder: 5,
      tasks: [
        { title: 'Check your credit score', description: 'Review your credit report for errors and understand where you stand before applying for a mortgage.', sortOrder: 1 },
        { title: 'Calculate how much home you can afford', description: 'A common guideline is to keep total housing costs below 32% of gross income. Factor in property tax and maintenance.', sortOrder: 2 },
        { title: 'Save for a down payment (aim for 20%)', description: 'A 20% down payment avoids mortgage default insurance and reduces monthly payments significantly.', sortOrder: 3 },
        { title: 'Get pre-approved for a mortgage', description: 'Pre-approval tells you your maximum purchase price and shows sellers you are a serious buyer.', sortOrder: 4 },
        { title: 'Work with a buyer\'s agent', description: 'A good agent will protect your interests, negotiate on your behalf, and guide you through the legal process.', sortOrder: 5 },
        { title: 'Make an offer and close', description: 'Submit a competitive offer with conditions (inspection, financing), satisfy conditions, and complete the closing.', sortOrder: 6 },
      ],
    },
    {
      slug: 'protect-yourself',
      title: 'Protect Yourself',
      description: 'Ensure your finances and loved ones are protected against life\'s unexpected events.',
      category: 'protect',
      icon: '☂️',
      sortOrder: 6,
      tasks: [
        { title: 'Review your life insurance coverage', description: 'A common rule is 10× your annual income in coverage. Review if your current policy still matches your family needs.', sortOrder: 1 },
        { title: 'Check disability insurance', description: 'Disability is more likely than death during working years. Ensure you have at least 60% of income covered.', sortOrder: 2 },
        { title: 'Ensure you have health coverage', description: 'Confirm you have adequate coverage for dental, vision, prescriptions, and paramedical services.', sortOrder: 3 },
        { title: 'Create or update your will', description: 'A will ensures your assets go where you want and appoints a guardian for any children.', sortOrder: 4 },
        { title: 'Set up beneficiaries on accounts', description: 'Designate beneficiaries on RRSPs, TFSAs, life insurance, and pension plans so assets pass outside probate.', sortOrder: 5 },
        { title: 'Review coverage annually', description: 'Life changes — marriage, children, mortgage — all affect your protection needs. Review every year.', sortOrder: 6 },
      ],
    },
  ];

  for (const topic of topics) {
    const { tasks, ...topicData } = topic;
    const existing = await prisma.adviceTopic.findUnique({ where: { slug: topicData.slug } });
    if (!existing) {
      await prisma.adviceTopic.create({
        data: {
          ...topicData,
          tasks: {
            create: tasks,
          },
        },
      });
      console.log(`  Advice topic created: ${topicData.title}`);
    }
  }

  // Seed 50/30/20 bucket types for all categories
  await seedCategoryBuckets();
}

// ---------------------------------------------------------------------------
// Bucket seeding — maps known category names to 50/30/20 buckets
// ---------------------------------------------------------------------------

async function seedCategoryBuckets() {
  const needsNames = new Set([
    'housing', 'rent', 'mortgage', 'utilities', 'groceries', 'food & grocery',
    'insurance', 'health & medical', 'healthcare', 'medical', 'transport',
    'auto & transport', 'gas', 'childcare', 'phone', 'internet', 'subscriptions',
    // seed-specific
    'rent/mortgage', 'hydro', 'ttc / transit', 'doctor / dental', 'pharmacy',
    'mental health',
  ]);

  const wantsNames = new Set([
    'dining', 'restaurants', 'food & dining', 'entertainment', 'shopping',
    'travel', 'personal care', 'hobbies', 'sports', 'gifts', 'clothing',
    'electronics', 'beauty',
    // seed-specific
    'coffee shops', 'takeout & delivery', 'alcohol & bars', 'amazon',
    'online shopping', 'home & garden', 'movies & tv', 'music', 'games',
    'events & concerts', 'flights', 'hotels', 'vacation', 'travel insurance',
    'gym', 'parking', 'rideshare', 'car maintenance',
  ]);

  const savingsNames = new Set([
    'investments', 'savings', 'retirement', 'debt payment', 'loan payment',
    'transfer', 'goals',
    // seed-specific
    'tfsa contribution', 'rrsp contribution', 'investment purchase',
    'books & courses', 'professional development',
  ]);

  const allCategories = await prisma.category.findMany({
    select: { id: true, name: true },
  });

  for (const cat of allCategories) {
    const lower = cat.name.toLowerCase();
    let bucketType: string;

    if (needsNames.has(lower)) {
      bucketType = 'needs';
    } else if (wantsNames.has(lower)) {
      bucketType = 'wants';
    } else if (savingsNames.has(lower)) {
      bucketType = 'savings';
    } else {
      bucketType = 'uncategorized';
    }

    await prisma.category.update({
      where: { id: cat.id },
      data: { bucketType },
    });
  }

  console.log(`  Seeded bucketType for ${allCategories.length} categories`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
