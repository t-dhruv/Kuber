/**
 * default-categories.ts
 *
 * Canonical category definitions for every new Kuber household.
 * Used at signup (to seed the new household) and in the demo seed.
 *
 * Each group has a `type` ("income" | "expense" | "transfer") and an ordered
 * list of categories with emoji, 50/30/20 bucket, and optional tax-deductible flag.
 */

export type BucketType = 'needs' | 'wants' | 'savings' | 'uncategorized';

export interface CategoryDef {
  name: string;
  emoji: string;
  bucketType: BucketType;
  isTaxDeductible?: boolean;
}

export interface CategoryGroupDef {
  name: string;
  type: 'income' | 'expense' | 'transfer';
  categories: CategoryDef[];
}

export const DEFAULT_CATEGORY_GROUPS: CategoryGroupDef[] = [
  // ── Income ────────────────────────────────────────────────────────────────
  {
    name: 'Income',
    type: 'income',
    categories: [
      { name: 'Salary & Wages',           emoji: '💼', bucketType: 'uncategorized' },
      { name: 'Freelance & Consulting',    emoji: '💻', bucketType: 'uncategorized' },
      { name: 'Rental Income',             emoji: '🏠', bucketType: 'uncategorized' },
      { name: 'Business Income',           emoji: '🏢', bucketType: 'uncategorized' },
      { name: 'Investment Dividends',      emoji: '📈', bucketType: 'uncategorized' },
      { name: 'Capital Gains',             emoji: '📊', bucketType: 'uncategorized' },
      { name: 'Government Benefits',       emoji: '🏛️', bucketType: 'uncategorized' },
      { name: 'Pension & Retirement',      emoji: '👴', bucketType: 'uncategorized' },
      { name: 'Side Hustle',               emoji: '🔨', bucketType: 'uncategorized' },
      { name: 'Gifts & Bonuses',           emoji: '🎁', bucketType: 'uncategorized' },
      { name: 'Tax Refund',                emoji: '🏦', bucketType: 'uncategorized' },
      { name: 'Reimbursements',            emoji: '💸', bucketType: 'uncategorized' },
      { name: 'Interest Income',           emoji: '💰', bucketType: 'uncategorized' },
      { name: 'Other Income',              emoji: '➕', bucketType: 'uncategorized' },
    ],
  },

  // ── Housing & Utilities ───────────────────────────────────────────────────
  {
    name: 'Housing & Utilities',
    type: 'expense',
    categories: [
      { name: 'Rent & Mortgage',           emoji: '🏠', bucketType: 'needs' },
      { name: 'Strata / HOA Fees',         emoji: '🏢', bucketType: 'needs' },
      { name: 'Property Taxes',            emoji: '🏛️', bucketType: 'needs', isTaxDeductible: true },
      { name: 'Home Maintenance & Repairs',emoji: '🛠️', bucketType: 'needs' },
      { name: 'Home Renovations',          emoji: '🔨', bucketType: 'wants' },
      { name: 'Electricity / Hydro',       emoji: '⚡', bucketType: 'needs' },
      { name: 'Water & Sewage',            emoji: '💧', bucketType: 'needs' },
      { name: 'Natural Gas / Heating',     emoji: '🔥', bucketType: 'needs' },
      { name: 'Internet',                  emoji: '📶', bucketType: 'needs' },
      { name: 'Phone Plan',                emoji: '📱', bucketType: 'needs' },
      { name: 'Cable / Satellite TV',      emoji: '📺', bucketType: 'wants' },
      { name: 'Home Insurance',            emoji: '🛡️', bucketType: 'needs' },
      { name: 'Security System',           emoji: '🔒', bucketType: 'needs' },
      { name: 'Lawn & Garden',             emoji: '🌿', bucketType: 'wants' },
      { name: 'Cleaning & Housekeeping',   emoji: '🧹', bucketType: 'wants' },
      { name: 'Furniture & Appliances',    emoji: '🛋️', bucketType: 'wants' },
    ],
  },

  // ── Food & Dining ─────────────────────────────────────────────────────────
  {
    name: 'Food & Dining',
    type: 'expense',
    categories: [
      { name: 'Groceries',                 emoji: '🛒', bucketType: 'needs' },
      { name: 'Restaurants',               emoji: '🍽️', bucketType: 'wants' },
      { name: 'Fast Food',                 emoji: '🍔', bucketType: 'wants' },
      { name: 'Coffee Shops',              emoji: '☕', bucketType: 'wants' },
      { name: 'Takeout & Delivery',        emoji: '🥡', bucketType: 'wants' },
      { name: 'Alcohol & Bars',            emoji: '🍷', bucketType: 'wants' },
      { name: 'Work Lunches',              emoji: '🥗', bucketType: 'needs' },
    ],
  },

  // ── Transportation ────────────────────────────────────────────────────────
  {
    name: 'Transportation',
    type: 'expense',
    categories: [
      { name: 'Fuel & Gas',                emoji: '⛽', bucketType: 'needs' },
      { name: 'Public Transit',            emoji: '🚆', bucketType: 'needs' },
      { name: 'Rideshare & Taxi',          emoji: '🚗', bucketType: 'wants' },
      { name: 'Auto Insurance',            emoji: '🚘', bucketType: 'needs' },
      { name: 'Car Maintenance & Repairs', emoji: '🔧', bucketType: 'needs' },
      { name: 'Car Payment / Lease',       emoji: '🏎️', bucketType: 'needs' },
      { name: 'Parking & Tolls',           emoji: '🅿️', bucketType: 'wants' },
      { name: 'Registration & Licensing',  emoji: '🆔', bucketType: 'needs' },
      { name: 'Bicycle & Scooter',         emoji: '🚲', bucketType: 'wants' },
    ],
  },

  // ── Health & Personal Care ────────────────────────────────────────────────
  {
    name: 'Health & Personal Care',
    type: 'expense',
    categories: [
      { name: 'Doctor & Specialists',      emoji: '🩺', bucketType: 'needs', isTaxDeductible: true },
      { name: 'Pharmacy & Medications',    emoji: '💊', bucketType: 'needs', isTaxDeductible: true },
      { name: 'Dental',                    emoji: '🦷', bucketType: 'needs', isTaxDeductible: true },
      { name: 'Vision & Optometry',        emoji: '👓', bucketType: 'needs', isTaxDeductible: true },
      { name: 'Mental Health & Therapy',   emoji: '🧘', bucketType: 'needs', isTaxDeductible: true },
      { name: 'Gym & Fitness',             emoji: '🏋️', bucketType: 'wants' },
      { name: 'Yoga & Wellness',           emoji: '🧘', bucketType: 'wants' },
      { name: 'Hair & Beauty',             emoji: '✂️', bucketType: 'wants' },
      { name: 'Toiletries & Hygiene',      emoji: '🧴', bucketType: 'needs' },
      { name: 'Vitamins & Supplements',    emoji: '💉', bucketType: 'wants' },
      { name: 'Health Insurance',          emoji: '🏥', bucketType: 'needs' },
    ],
  },

  // ── Family & Pets ─────────────────────────────────────────────────────────
  {
    name: 'Family & Pets',
    type: 'expense',
    categories: [
      { name: 'Childcare & Daycare',       emoji: '👶', bucketType: 'needs' },
      { name: 'School Fees & Supplies',    emoji: '🎒', bucketType: 'needs' },
      { name: 'Extracurricular Activities',emoji: '🎭', bucketType: 'wants' },
      { name: 'Toys & Kids Activities',    emoji: '🧩', bucketType: 'wants' },
      { name: 'Baby & Infant',             emoji: '🍼', bucketType: 'needs' },
      { name: 'Pet Food & Supplies',       emoji: '🦴', bucketType: 'needs' },
      { name: 'Vet & Pet Medications',     emoji: '🐕', bucketType: 'needs' },
      { name: 'Pet Insurance',             emoji: '🐾', bucketType: 'needs' },
      { name: 'Pet Grooming',              emoji: '🎾', bucketType: 'wants' },
      { name: 'Elder Care',                emoji: '👵', bucketType: 'needs' },
    ],
  },

  // ── Shopping & Lifestyle ─────────────────────────────────────────────────
  {
    name: 'Shopping & Lifestyle',
    type: 'expense',
    categories: [
      { name: 'Clothing & Apparel',        emoji: '👕', bucketType: 'wants' },
      { name: 'Shoes & Accessories',       emoji: '👟', bucketType: 'wants' },
      { name: 'Electronics & Gadgets',     emoji: '🖥️', bucketType: 'wants' },
      { name: 'Books & Magazines',         emoji: '📚', bucketType: 'wants' },
      { name: 'Online Shopping',           emoji: '🛍️', bucketType: 'wants' },
      { name: 'Home Goods & Décor',        emoji: '🏡', bucketType: 'wants' },
      { name: 'Sports & Outdoor Gear',     emoji: '⛷️', bucketType: 'wants' },
      { name: 'Subscriptions',             emoji: '🔄', bucketType: 'wants' },
      { name: 'Hobbies & Crafts',          emoji: '🎨', bucketType: 'wants' },
      { name: 'Gifts Given',               emoji: '🎁', bucketType: 'wants' },
    ],
  },

  // ── Entertainment ─────────────────────────────────────────────────────────
  {
    name: 'Entertainment',
    type: 'expense',
    categories: [
      { name: 'Movies & Streaming',        emoji: '🎬', bucketType: 'wants' },
      { name: 'Music & Concerts',          emoji: '🎵', bucketType: 'wants' },
      { name: 'Video Games',               emoji: '🎮', bucketType: 'wants' },
      { name: 'Events & Tickets',          emoji: '🎟️', bucketType: 'wants' },
      { name: 'Sports Events',             emoji: '⚽', bucketType: 'wants' },
      { name: 'Museums & Attractions',     emoji: '🏛️', bucketType: 'wants' },
      { name: 'Gambling & Lottery',        emoji: '🎲', bucketType: 'wants' },
      { name: 'Nightlife & Clubs',         emoji: '🎉', bucketType: 'wants' },
    ],
  },

  // ── Travel ────────────────────────────────────────────────────────────────
  {
    name: 'Travel',
    type: 'expense',
    categories: [
      { name: 'Flights',                   emoji: '✈️', bucketType: 'wants' },
      { name: 'Hotels & Lodging',          emoji: '🛏️', bucketType: 'wants' },
      { name: 'Car Rental',                emoji: '🚙', bucketType: 'wants' },
      { name: 'Vacation Activities',       emoji: '🌴', bucketType: 'wants' },
      { name: 'Travel Food & Dining',      emoji: '🍜', bucketType: 'wants' },
      { name: 'Travel Insurance',          emoji: '🌍', bucketType: 'wants' },
      { name: 'Passport & Visas',          emoji: '🛂', bucketType: 'wants' },
      { name: 'Luggage & Accessories',     emoji: '🧳', bucketType: 'wants' },
    ],
  },

  // ── Education & Career ────────────────────────────────────────────────────
  {
    name: 'Education & Career',
    type: 'expense',
    categories: [
      { name: 'Tuition & University',      emoji: '🎓', bucketType: 'needs', isTaxDeductible: true },
      { name: 'Student Loan Payments',     emoji: '🏫', bucketType: 'needs' },
      { name: 'Online Courses & Training', emoji: '💻', bucketType: 'needs' },
      { name: 'Books & Learning Materials',emoji: '📖', bucketType: 'needs' },
      { name: 'Professional Development',  emoji: '📈', bucketType: 'wants' },
      { name: 'Work Expenses',             emoji: '💼', bucketType: 'needs', isTaxDeductible: true },
      { name: 'Professional Memberships',  emoji: '🏆', bucketType: 'needs', isTaxDeductible: true },
      { name: 'Home Office Supplies',      emoji: '🖊️', bucketType: 'needs', isTaxDeductible: true },
    ],
  },

  // ── Financial & Savings ───────────────────────────────────────────────────
  {
    name: 'Financial & Savings',
    type: 'expense',
    categories: [
      { name: 'Emergency Fund',            emoji: '🚨', bucketType: 'savings' },
      { name: 'RRSP / 401(k) Contribution',emoji: '💰', bucketType: 'savings', isTaxDeductible: true },
      { name: 'TFSA / Roth IRA',           emoji: '🏦', bucketType: 'savings' },
      { name: 'RESP / Education Savings',  emoji: '🎓', bucketType: 'savings' },
      { name: 'General Investments',       emoji: '📉', bucketType: 'savings' },
      { name: 'Mortgage Payment',          emoji: '🏠', bucketType: 'needs' },
      { name: 'Loan / Debt Repayment',     emoji: '💸', bucketType: 'needs' },
      { name: 'Credit Card Payment',       emoji: '💳', bucketType: 'needs' },
      { name: 'Bank Fees & Interest',      emoji: '🏛️', bucketType: 'needs' },
      { name: 'Life Insurance',            emoji: '📋', bucketType: 'needs' },
      { name: 'Disability Insurance',      emoji: '🩹', bucketType: 'needs' },
      { name: 'Accountant & Tax Prep',     emoji: '🧾', bucketType: 'needs', isTaxDeductible: true },
      { name: 'Financial Advisor',         emoji: '📊', bucketType: 'needs' },
    ],
  },

  // ── Taxes ─────────────────────────────────────────────────────────────────
  {
    name: 'Taxes',
    type: 'expense',
    categories: [
      { name: 'Income Tax Owing',          emoji: '🧾', bucketType: 'needs' },
      { name: 'HST / GST / VAT',           emoji: '🏦', bucketType: 'needs' },
      { name: 'Property Transfer Tax',     emoji: '🏛️', bucketType: 'needs' },
      { name: 'Capital Gains Tax',         emoji: '📊', bucketType: 'needs' },
    ],
  },

  // ── Gifts & Donations ─────────────────────────────────────────────────────
  {
    name: 'Gifts & Donations',
    type: 'expense',
    categories: [
      { name: 'Charitable Donations',      emoji: '🎗️', bucketType: 'wants', isTaxDeductible: true },
      { name: 'Religious Giving / Tithing',emoji: '⛪', bucketType: 'wants', isTaxDeductible: true },
      { name: 'Birthday & Holiday Gifts',  emoji: '🎂', bucketType: 'wants' },
      { name: 'Wedding & Baby Gifts',      emoji: '💒', bucketType: 'wants' },
    ],
  },

  // ── Business (self-employed / side hustle) ────────────────────────────────
  {
    name: 'Business Expenses',
    type: 'expense',
    categories: [
      { name: 'Advertising & Marketing',   emoji: '📣', bucketType: 'uncategorized', isTaxDeductible: true },
      { name: 'Software & SaaS',           emoji: '💻', bucketType: 'uncategorized', isTaxDeductible: true },
      { name: 'Business Travel',           emoji: '✈️', bucketType: 'uncategorized', isTaxDeductible: true },
      { name: 'Client Entertainment',      emoji: '🍽️', bucketType: 'uncategorized', isTaxDeductible: true },
      { name: 'Office Rent',               emoji: '🏢', bucketType: 'uncategorized', isTaxDeductible: true },
      { name: 'Contractors & Subcontractors',emoji:'👥', bucketType: 'uncategorized', isTaxDeductible: true },
      { name: 'Business Insurance',        emoji: '🛡️', bucketType: 'uncategorized', isTaxDeductible: true },
      { name: 'Equipment & Tools',         emoji: '🔧', bucketType: 'uncategorized', isTaxDeductible: true },
      { name: 'Professional Services',     emoji: '⚖️', bucketType: 'uncategorized', isTaxDeductible: true },
      { name: 'Business Bank Fees',        emoji: '🏦', bucketType: 'uncategorized', isTaxDeductible: true },
    ],
  },

  // ── Transfers ─────────────────────────────────────────────────────────────
  {
    name: 'Transfers',
    type: 'transfer',
    categories: [
      { name: 'Internal Transfer',         emoji: '↔️', bucketType: 'uncategorized' },
      { name: 'Balance Adjustment',        emoji: '⚖️', bucketType: 'uncategorized' },
      { name: 'e-Transfer Sent',           emoji: '📤', bucketType: 'uncategorized' },
      { name: 'e-Transfer Received',       emoji: '📥', bucketType: 'uncategorized' },
    ],
  },

  // ── Uncategorized ─────────────────────────────────────────────────────────
  {
    name: 'Uncategorized',
    type: 'expense',
    categories: [
      { name: 'Uncategorized',             emoji: '❓', bucketType: 'uncategorized' },
    ],
  },
];

/**
 * Seed the default category groups and categories for a given household.
 * Returns a Map<categoryName, categoryId> for downstream use.
 */
export async function seedDefaultCategories(
  tx: {
    categoryGroup: { create: (args: any) => Promise<{ id: string }> };
    category: { create: (args: any) => Promise<{ id: string }> };
  },
  householdId: string,
): Promise<Map<string, string>> {
  const categoryMap = new Map<string, string>();

  for (let gi = 0; gi < DEFAULT_CATEGORY_GROUPS.length; gi++) {
    const gd = DEFAULT_CATEGORY_GROUPS[gi];
    const group = await tx.categoryGroup.create({
      data: {
        householdId,
        name: gd.name,
        type: gd.type,
        sortOrder: gi,
      },
    });

    for (let ci = 0; ci < gd.categories.length; ci++) {
      const cd = gd.categories[ci];
      const cat = await tx.category.create({
        data: {
          householdId,
          name: cd.name,
          icon: cd.emoji,
          type: gd.type,
          groupId: group.id,
          sortOrder: ci,
          isTaxDeductible: cd.isTaxDeductible ?? false,
        },
      });
      categoryMap.set(cd.name, cat.id);
    }
  }

  return categoryMap;
}
