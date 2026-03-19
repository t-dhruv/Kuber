import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { faker } from '@faker-js/faker';

faker.seed(42);

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

function randomBetween(min: number, max: number): number {
  return faker.number.float({ min, max, fractionDigits: 2 });
}

function randomInt(min: number, max: number): number {
  return faker.number.int({ min, max });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Clearing existing data…');

  // Clear in reverse FK order (sequential — not in a single $transaction block
  // so each statement runs after the previous to avoid FK violations).
  await prisma.goalAllocation.deleteMany();
  await prisma.transactionTag.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.investmentHolding.deleteMany();
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
  // User + Household
  // -------------------------------------------------------------------------

  const passwordHash = await bcrypt.hash('password123', 12);

  const user = await prisma.user.create({
    data: {
      email: 'demo@kuber.app',
      passwordHash,
      firstName: 'Alex',
      lastName: 'Morgan',
      timezone: 'America/New_York',
      theme: 'system',
    },
  });

  const household = await prisma.household.create({
    data: {
      name: 'Morgan Household',
      currency: 'USD',
      fiscalYearStart: 1,
    },
  });

  await prisma.householdMember.create({
    data: {
      userId: user.id,
      householdId: household.id,
      role: 'owner',
    },
  });

  // -------------------------------------------------------------------------
  // Accounts
  // -------------------------------------------------------------------------

  const checkingAccount = await prisma.account.create({
    data: {
      householdId: household.id,
      name: 'Chase Checking',
      type: 'CHECKING',
      institution: 'Chase',
      balance: 4250.0,
      lastFour: '4321',
      currency: 'USD',
    },
  });

  const creditCardAccount = await prisma.account.create({
    data: {
      householdId: household.id,
      name: 'Chase Sapphire Credit',
      type: 'CREDIT_CARD',
      institution: 'Chase',
      balance: -1840.5,
      lastFour: '9876',
      currency: 'USD',
    },
  });

  const investmentAccount = await prisma.account.create({
    data: {
      householdId: household.id,
      name: 'Vanguard Investment',
      type: 'INVESTMENT',
      institution: 'Vanguard',
      balance: 28450.0,
      lastFour: '1122',
      currency: 'USD',
    },
  });

  // -------------------------------------------------------------------------
  // Category Groups + Categories
  // -------------------------------------------------------------------------

  type CategoryDef = { name: string; icon: string; color: string };
  type GroupDef = { name: string; type: string; categories: CategoryDef[] };

  const groupDefs: GroupDef[] = [
    {
      name: 'Income',
      type: 'income',
      categories: [
        { name: 'Paychecks', icon: 'briefcase', color: '#2f9e44' },
        { name: 'Freelance', icon: 'laptop', color: '#2f9e44' },
        { name: 'Interest & Dividends', icon: 'trending-up', color: '#2f9e44' },
        { name: 'Other Income', icon: 'plus-circle', color: '#2f9e44' },
      ],
    },
    {
      name: 'Food & Dining',
      type: 'expense',
      categories: [
        { name: 'Groceries', icon: 'shopping-cart', color: '#E5622A' },
        { name: 'Restaurants', icon: 'utensils', color: '#E5622A' },
        { name: 'Coffee Shops', icon: 'coffee', color: '#E5622A' },
        { name: 'Alcohol & Bars', icon: 'wine', color: '#E5622A' },
      ],
    },
    {
      name: 'Shopping',
      type: 'expense',
      categories: [
        { name: 'Clothing', icon: 'shirt', color: '#7950f2' },
        { name: 'Electronics', icon: 'monitor', color: '#7950f2' },
        { name: 'Amazon', icon: 'package', color: '#7950f2' },
        { name: 'Online Shopping', icon: 'globe', color: '#7950f2' },
      ],
    },
    {
      name: 'Bills & Utilities',
      type: 'expense',
      categories: [
        { name: 'Rent/Mortgage', icon: 'home', color: '#1971c2' },
        { name: 'Electric', icon: 'zap', color: '#1971c2' },
        { name: 'Internet', icon: 'wifi', color: '#1971c2' },
        { name: 'Phone', icon: 'phone', color: '#1971c2' },
        { name: 'Subscriptions', icon: 'repeat', color: '#1971c2' },
      ],
    },
    {
      name: 'Transportation',
      type: 'expense',
      categories: [
        { name: 'Gas', icon: 'fuel', color: '#e67700' },
        { name: 'Parking', icon: 'square-parking', color: '#e67700' },
        { name: 'Rideshare', icon: 'car', color: '#e67700' },
        { name: 'Public Transit', icon: 'train', color: '#e67700' },
      ],
    },
    {
      name: 'Health & Wellness',
      type: 'expense',
      categories: [
        { name: 'Gym', icon: 'dumbbell', color: '#f76707' },
        { name: 'Doctor', icon: 'stethoscope', color: '#f76707' },
        { name: 'Pharmacy', icon: 'pill', color: '#f76707' },
      ],
    },
    {
      name: 'Entertainment',
      type: 'expense',
      categories: [
        { name: 'Movies & TV', icon: 'film', color: '#9c36b5' },
        { name: 'Music', icon: 'music', color: '#9c36b5' },
        { name: 'Games', icon: 'gamepad-2', color: '#9c36b5' },
        { name: 'Events & Concerts', icon: 'ticket', color: '#9c36b5' },
      ],
    },
    {
      name: 'Travel',
      type: 'expense',
      categories: [
        { name: 'Flights', icon: 'plane', color: '#0c8599' },
        { name: 'Hotels', icon: 'bed', color: '#0c8599' },
        { name: 'Vacation', icon: 'palmtree', color: '#0c8599' },
      ],
    },
    {
      name: 'Transfer',
      type: 'transfer',
      categories: [
        { name: 'Transfer', icon: 'arrows-left-right', color: '#6c757d' },
      ],
    },
  ];

  // Map: category name -> prisma id
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
          emoji: cd.icon, // icon slug stored in emoji field
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
  // Transactions — 14 months of data
  // -------------------------------------------------------------------------

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const groceryMerchants = [
    'Whole Foods', "Trader Joe's", 'Kroger', 'Safeway', 'Costco', 'Aldi',
  ];
  const restaurantMerchants = [
    'Chipotle', "McDonald's", 'Panera Bread', 'Olive Garden', "Chili's",
    'Shake Shack', 'Five Guys', 'Subway', "Domino's", "Applebee's",
  ];
  const coffeeMerchants = ['Starbucks', "Dunkin'", "Peet's Coffee", 'Blue Bottle'];
  const amazonMerchants = ['Amazon', 'Amazon.com'];
  const onlineMerchants = ['eBay', 'Etsy', 'Target.com', 'Walmart.com', 'Best Buy Online'];
  const clothingMerchants = ['H&M', 'Zara', 'Gap', 'Old Navy', 'Nordstrom'];
  const gasMerchants = ['Shell', 'BP', 'Chevron', 'ExxonMobil', 'Sunoco'];
  const entertainmentMerchants = ['AMC Theatres', 'Regal Cinemas', 'Ticketmaster', 'StubHub'];

  interface TxInput {
    accountId: string;
    date: Date;
    description: string;
    amount: number;
    categoryId: string;
  }

  const txInputs: TxInput[] = [];

  for (let monthOffset = 13; monthOffset >= 0; monthOffset--) {
    const monthStart = startOfMonth(addMonths(today, -monthOffset));
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const effectiveEnd = monthEnd < today ? monthEnd : today;
    const daysInRange = Math.max(
      1,
      Math.floor((effectiveEnd.getTime() - monthStart.getTime()) / 86400000),
    );

    const dayOf = (d: number): Date => {
      const dt = new Date(monthStart);
      dt.setDate(Math.min(d, daysInRange));
      return dt;
    };

    const randDay = (): Date => {
      const dt = new Date(monthStart);
      dt.setDate(randomInt(1, daysInRange));
      return dt;
    };

    // Paychecks — 1st and 15th
    txInputs.push({
      accountId: checkingAccount.id,
      date: dayOf(1),
      description: 'Direct Deposit - Employer',
      amount: 3400.0,
      categoryId: catId('Paychecks'),
    });
    txInputs.push({
      accountId: checkingAccount.id,
      date: dayOf(15),
      description: 'Direct Deposit - Employer',
      amount: 3400.0,
      categoryId: catId('Paychecks'),
    });

    // Rent — 1st
    txInputs.push({
      accountId: checkingAccount.id,
      date: dayOf(1),
      description: 'Rent Payment',
      amount: -1800.0,
      categoryId: catId('Rent/Mortgage'),
    });

    // Electric
    txInputs.push({
      accountId: checkingAccount.id,
      date: dayOf(randomInt(3, 8)),
      description: 'Electric Company',
      amount: -randomBetween(65, 120),
      categoryId: catId('Electric'),
    });

    // Internet — fixed 5th
    txInputs.push({
      accountId: checkingAccount.id,
      date: dayOf(5),
      description: 'Internet Service',
      amount: -79.99,
      categoryId: catId('Internet'),
    });

    // Phone — fixed 10th
    txInputs.push({
      accountId: checkingAccount.id,
      date: dayOf(10),
      description: 'Phone Bill',
      amount: -45.0,
      categoryId: catId('Phone'),
    });

    // Gym — 0 or 1 per month
    if (faker.datatype.boolean()) {
      txInputs.push({
        accountId: checkingAccount.id,
        date: dayOf(5),
        description: 'Gym Membership',
        amount: -29.99,
        categoryId: catId('Gym'),
      });
    }

    // Groceries — 4 trips
    for (let i = 0; i < 4; i++) {
      txInputs.push({
        accountId: checkingAccount.id,
        date: randDay(),
        description: faker.helpers.arrayElement(groceryMerchants),
        amount: -randomBetween(45, 180),
        categoryId: catId('Groceries'),
      });
    }

    // Restaurants — 6-10
    const numRestaurants = randomInt(6, 10);
    for (let i = 0; i < numRestaurants; i++) {
      txInputs.push({
        accountId: creditCardAccount.id,
        date: randDay(),
        description: faker.helpers.arrayElement(restaurantMerchants),
        amount: -randomBetween(12, 85),
        categoryId: catId('Restaurants'),
      });
    }

    // Coffee — 2-4
    const numCoffee = randomInt(2, 4);
    for (let i = 0; i < numCoffee; i++) {
      txInputs.push({
        accountId: creditCardAccount.id,
        date: randDay(),
        description: faker.helpers.arrayElement(coffeeMerchants),
        amount: -randomBetween(4, 8),
        categoryId: catId('Coffee Shops'),
      });
    }

    // Subscriptions — Netflix + Spotify every month
    txInputs.push({
      accountId: creditCardAccount.id,
      date: dayOf(1),
      description: 'Netflix',
      amount: -15.99,
      categoryId: catId('Subscriptions'),
    });
    txInputs.push({
      accountId: creditCardAccount.id,
      date: dayOf(1),
      description: 'Spotify',
      amount: -13.99,
      categoryId: catId('Subscriptions'),
    });

    // Shopping — 1-3 per month, mix of Amazon / Online / Clothing
    const numShopping = randomInt(1, 3);
    for (let i = 0; i < numShopping; i++) {
      const shoppingType = faker.helpers.arrayElement(['amazon', 'online', 'clothing'] as const);
      let merchant: string;
      let categoryName: string;
      if (shoppingType === 'amazon') {
        merchant = faker.helpers.arrayElement(amazonMerchants);
        categoryName = 'Amazon';
      } else if (shoppingType === 'online') {
        merchant = faker.helpers.arrayElement(onlineMerchants);
        categoryName = 'Online Shopping';
      } else {
        merchant = faker.helpers.arrayElement(clothingMerchants);
        categoryName = 'Clothing';
      }
      txInputs.push({
        accountId: creditCardAccount.id,
        date: randDay(),
        description: merchant,
        amount: -randomBetween(20, 200),
        categoryId: catId(categoryName),
      });
    }

    // Gas — 1-2 per month
    const numGas = randomInt(1, 2);
    for (let i = 0; i < numGas; i++) {
      txInputs.push({
        accountId: creditCardAccount.id,
        date: randDay(),
        description: faker.helpers.arrayElement(gasMerchants),
        amount: -randomBetween(40, 65),
        categoryId: catId('Gas'),
      });
    }

    // Entertainment — 0-2 per month
    const numEntertainment = randomInt(0, 2);
    for (let i = 0; i < numEntertainment; i++) {
      txInputs.push({
        accountId: creditCardAccount.id,
        date: randDay(),
        description: faker.helpers.arrayElement(entertainmentMerchants),
        amount: -randomBetween(15, 60),
        categoryId: catId('Movies & TV'),
      });
    }
  }

  console.log(`Creating ${txInputs.length} transactions…`);

  // Bulk-create via individual creates so that createdAt ordering is preserved
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
  // Budgets — current month, monthly period
  // -------------------------------------------------------------------------

  const budgetDefs: Array<{ category: string; amount: number }> = [
    { category: 'Groceries', amount: 600 },
    { category: 'Restaurants', amount: 400 },
    { category: 'Coffee Shops', amount: 60 },
    { category: 'Rent/Mortgage', amount: 1800 },
    { category: 'Electric', amount: 120 },
    { category: 'Internet', amount: 79.99 },
    { category: 'Phone', amount: 45 },
    { category: 'Subscriptions', amount: 50 },
    { category: 'Amazon', amount: 100 },
    { category: 'Online Shopping', amount: 100 },
    { category: 'Clothing', amount: 100 },
    { category: 'Gas', amount: 150 },
    { category: 'Movies & TV', amount: 100 },
    { category: 'Gym', amount: 30 },
  ];

  await prisma.budget.createMany({
    data: budgetDefs.map((bd) => ({
      householdId: household.id,
      categoryId: catId(bd.category),
      amount: bd.amount,
      period: 'monthly',
      startDate: startOfMonth(today),
    })),
  });

  // -------------------------------------------------------------------------
  // Recurring Items
  // -------------------------------------------------------------------------

  const nextMonth1st = startOfMonth(addMonths(today, 1));

  await prisma.recurringItem.createMany({
    data: [
      {
        householdId: household.id,
        name: 'Netflix',
        amount: -15.99,
        frequency: 'monthly',
        nextDate: nextMonth1st,
        accountId: creditCardAccount.id,
        categoryId: catId('Subscriptions'),
        isAutopay: true,
        isActive: true,
      },
      {
        householdId: household.id,
        name: 'Spotify',
        amount: -13.99,
        frequency: 'monthly',
        nextDate: nextMonth1st,
        accountId: creditCardAccount.id,
        categoryId: catId('Subscriptions'),
        isAutopay: true,
        isActive: true,
      },
      {
        householdId: household.id,
        name: 'Gym Membership',
        amount: -29.99,
        frequency: 'monthly',
        nextDate: nextMonth1st,
        accountId: checkingAccount.id,
        categoryId: catId('Gym'),
        isAutopay: true,
        isActive: true,
      },
      {
        householdId: household.id,
        name: 'Internet Bill',
        amount: -79.99,
        frequency: 'monthly',
        nextDate: nextMonth1st,
        accountId: checkingAccount.id,
        categoryId: catId('Internet'),
        isAutopay: false,
        isActive: true,
      },
      {
        householdId: household.id,
        name: 'Phone Bill',
        amount: -45.0,
        frequency: 'monthly',
        nextDate: nextMonth1st,
        accountId: checkingAccount.id,
        categoryId: catId('Phone'),
        isAutopay: false,
        isActive: true,
      },
    ],
  });

  // -------------------------------------------------------------------------
  // Goals
  // -------------------------------------------------------------------------

  await prisma.goal.createMany({
    data: [
      {
        householdId: household.id,
        name: 'Emergency Fund',
        type: 'savings',
        targetAmount: 15000,
        currentAmount: 4250,
        targetDate: addMonths(today, 18),
        accountId: checkingAccount.id,
        icon: 'shield',
      },
      {
        householdId: household.id,
        name: 'Vacation to Europe',
        type: 'savings',
        targetAmount: 5000,
        currentAmount: 850,
        targetDate: addMonths(today, 8),
        icon: 'plane',
      },
      {
        householdId: household.id,
        name: 'New Laptop',
        type: 'savings',
        targetAmount: 2000,
        currentAmount: 600,
        targetDate: addMonths(today, 3),
        icon: 'laptop',
      },
    ],
  });

  // -------------------------------------------------------------------------
  // Investment Holdings
  // -------------------------------------------------------------------------

  await prisma.investmentHolding.createMany({
    data: [
      {
        accountId: investmentAccount.id,
        symbol: 'VTI',
        name: 'Vanguard Total Market ETF',
        shares: 45,
        costBasis: 195.0,
        currentPrice: 230.0,
        assetClass: 'us_stock',
      },
      {
        accountId: investmentAccount.id,
        symbol: 'VXUS',
        name: 'Vanguard International',
        shares: 30,
        costBasis: 52.0,
        currentPrice: 58.5,
        assetClass: 'international_stock',
      },
      {
        accountId: investmentAccount.id,
        symbol: 'BND',
        name: 'Vanguard Bonds',
        shares: 20,
        costBasis: 74.0,
        currentPrice: 72.5,
        assetClass: 'bond',
      },
      {
        accountId: investmentAccount.id,
        symbol: 'AAPL',
        name: 'Apple Inc',
        shares: 10,
        costBasis: 165.0,
        currentPrice: 195.0,
        assetClass: 'us_stock',
      },
      {
        accountId: investmentAccount.id,
        symbol: 'MSFT',
        name: 'Microsoft Corp',
        shares: 5,
        costBasis: 310.0,
        currentPrice: 420.0,
        assetClass: 'us_stock',
      },
      {
        accountId: investmentAccount.id,
        symbol: 'GOOGL',
        name: 'Alphabet Inc',
        shares: 3,
        costBasis: 140.0,
        currentPrice: 175.0,
        assetClass: 'us_stock',
      },
    ],
  });

  // -------------------------------------------------------------------------
  // Tags
  // -------------------------------------------------------------------------

  await prisma.tag.createMany({
    data: [
      { householdId: household.id, name: 'Business', color: '#1971c2' },
      { householdId: household.id, name: 'Reimbursable', color: '#2f9e44' },
      { householdId: household.id, name: 'Tax Deductible', color: '#e67700' },
      { householdId: household.id, name: 'Joint', color: '#7950f2' },
      { householdId: household.id, name: 'Personal', color: '#6c757d' },
    ],
  });

  // -------------------------------------------------------------------------
  // Rules
  // -------------------------------------------------------------------------

  await prisma.rule.createMany({
    data: [
      {
        householdId: household.id,
        conditions: [{ field: 'merchant', operator: 'contains', value: 'Starbucks' }],
        actions: [{ type: 'set_category', categoryId: catId('Coffee Shops') }],
        sortOrder: 0,
        isActive: true,
      },
      {
        householdId: household.id,
        conditions: [{ field: 'merchant', operator: 'contains', value: 'Amazon' }],
        actions: [{ type: 'set_category', categoryId: catId('Amazon') }],
        sortOrder: 1,
        isActive: true,
      },
    ],
  });

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  console.log('Seed complete.');
  console.log(`  User:         demo@kuber.app / password123`);
  console.log(`  Household:    ${household.name} (${household.id})`);
  console.log(`  Accounts:     Chase Checking · Chase Sapphire Credit · Vanguard Investment`);
  console.log(`  Transactions: ${createdTransactions.length}`);
  console.log(`  Categories:   ${categoryMap.size} across ${groupDefs.length} groups`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
