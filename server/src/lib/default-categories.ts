/**
 * default-categories.ts
 *
 * Canonical category definitions for every new Kuber household.
 * Used at signup (to seed the new household) and in the demo seed.
 *
 * Each category has a `type` ("income" | "expense" | "transfer"), emoji,
 * 50/30/20 bucket, and optional tax-deductible flag.
 */

import type { Prisma } from '@prisma/client';

export type BucketType = 'needs' | 'wants' | 'savings';
export type CategoryType = 'income' | 'expense' | 'transfer';

export interface CategoryDef {
  name: string;
  emoji: string;
  type: CategoryType;
  bucketType: BucketType;
  isTaxDeductible?: boolean;
}

export interface CategoryGroupDef {
  name: string;
  categories: CategoryDef[];
}

type SeedDefaultCategoriesTransaction = {
  categoryGroup: {
    create: (args: Prisma.CategoryGroupCreateArgs) => Promise<{ id: string }>;
  };
  category: {
    create: (args: Prisma.CategoryCreateArgs) => Promise<{ id: string }>;
  };
};

function categoryDefs(
  type: CategoryType,
  categories: Array<Omit<CategoryDef, 'type'> & { type?: CategoryType }>,
): CategoryDef[] {
  return categories.map((category) => ({ ...category, type: category.type ?? type }));
}

export const DEFAULT_CATEGORY_GROUPS: CategoryGroupDef[] = [
  // ── Income ────────────────────────────────────────────────────────────────
  {
    name: 'Income',
    categories: categoryDefs('income', [
      { name: 'Salary & Wages',           emoji: '💼', bucketType: 'needs' },
      { name: 'Freelance & Consulting',    emoji: '💻', bucketType: 'needs' },
      { name: 'Rental Income',             emoji: '🏠', bucketType: 'needs' },
      { name: 'Business Income',           emoji: '🏢', bucketType: 'needs' },
      { name: 'Investment Dividends',      emoji: '📈', bucketType: 'savings' },
      { name: 'Capital Gains',             emoji: '📊', bucketType: 'savings' },
      { name: 'Government Benefits',       emoji: '🏛️', bucketType: 'needs' },
      { name: 'Pension & Retirement',      emoji: '👴', bucketType: 'needs' },
      { name: 'Side Hustle',               emoji: '🔨', bucketType: 'needs' },
      { name: 'Gifts & Bonuses',           emoji: '🎁', bucketType: 'savings' },
      { name: 'Tax Refund',                emoji: '🏦', bucketType: 'savings' },
      { name: 'Reimbursements',            emoji: '💸', bucketType: 'needs' },
      { name: 'Interest Income',           emoji: '💰', bucketType: 'savings' },
      { name: 'Interac e-Transfer Received', emoji: '📥', bucketType: 'savings' },
      { name: 'Other Income',              emoji: '➕', bucketType: 'needs' },
    ]),
  },

  // ── Housing & Utilities ───────────────────────────────────────────────────
  {
    name: 'Housing & Utilities',
    categories: categoryDefs('expense', [
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
    ]),
  },

  // ── Food & Dining ─────────────────────────────────────────────────────────
  {
    name: 'Food & Dining',
    categories: categoryDefs('expense', [
      { name: 'Groceries',                 emoji: '🛒', bucketType: 'needs' },
      { name: 'Restaurants',               emoji: '🍽️', bucketType: 'wants' },
      { name: 'Fast Food',                 emoji: '🍔', bucketType: 'wants' },
      { name: 'Coffee Shops',              emoji: '☕', bucketType: 'wants' },
      { name: 'Takeout & Delivery',        emoji: '🥡', bucketType: 'wants' },
      { name: 'Alcohol & Bars',            emoji: '🍷', bucketType: 'wants' },
      { name: 'Work Lunches',              emoji: '🥗', bucketType: 'needs' },
    ]),
  },

  // ── Transportation ────────────────────────────────────────────────────────
  {
    name: 'Transportation',
    categories: categoryDefs('expense', [
      { name: 'Fuel & Gas',                emoji: '⛽', bucketType: 'needs' },
      { name: 'Public Transit',            emoji: '🚆', bucketType: 'needs' },
      { name: 'Rideshare',                 emoji: '🚗', bucketType: 'wants' },
      { name: 'Auto Insurance',            emoji: '🚘', bucketType: 'needs' },
      { name: 'Car Maintenance & Repairs', emoji: '🔧', bucketType: 'needs' },
      { name: 'Car Lease Payment',         emoji: '🏎️', bucketType: 'needs' },
      { name: 'Auto Loan Principal',       emoji: '🚙', type: 'transfer', bucketType: 'savings' },
      { name: 'Parking & Tolls',           emoji: '🅿️', bucketType: 'wants' },
      { name: 'Registration & Licensing',  emoji: '🆔', bucketType: 'needs' },
      { name: 'Bicycle & Scooter',         emoji: '🚲', bucketType: 'wants' },
    ]),
  },

  // ── Health & Personal Care ────────────────────────────────────────────────
  {
    name: 'Health & Personal Care',
    categories: categoryDefs('expense', [
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
    ]),
  },

  // ── Family & Pets ─────────────────────────────────────────────────────────
  {
    name: 'Family & Pets',
    categories: categoryDefs('expense', [
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
    ]),
  },

  // ── Shopping & Lifestyle ─────────────────────────────────────────────────
  {
    name: 'Shopping & Lifestyle',
    categories: categoryDefs('expense', [
      { name: 'Clothing & Apparel',        emoji: '👕', bucketType: 'wants' },
      { name: 'Shoes & Accessories',       emoji: '👟', bucketType: 'wants' },
      { name: 'Electronics & Gadgets',     emoji: '🖥️', bucketType: 'wants' },
      { name: 'Books & Magazines',         emoji: '📚', bucketType: 'wants' },
      { name: 'Online Shopping',           emoji: '🛍️', bucketType: 'wants' },
      { name: 'Home & Garden',             emoji: '🏡', bucketType: 'wants' },
      { name: 'Home Goods & Décor',        emoji: '🏡', bucketType: 'wants' },
      { name: 'Sports & Outdoor Gear',     emoji: '⛷️', bucketType: 'wants' },
      { name: 'Subscriptions',             emoji: '🔄', bucketType: 'wants' },
      { name: 'Hobbies & Crafts',          emoji: '🎨', bucketType: 'wants' },
      { name: 'Gifts Given',               emoji: '🎁', bucketType: 'wants' },
    ]),
  },

  // ── Entertainment ─────────────────────────────────────────────────────────
  {
    name: 'Entertainment',
    categories: categoryDefs('expense', [
      { name: 'Movies & Streaming',        emoji: '🎬', bucketType: 'wants' },
      { name: 'Music & Concerts',          emoji: '🎵', bucketType: 'wants' },
      { name: 'Video Games',               emoji: '🎮', bucketType: 'wants' },
      { name: 'Events & Tickets',          emoji: '🎟️', bucketType: 'wants' },
      { name: 'Events & Concerts',         emoji: '🎟️', bucketType: 'wants' },
      { name: 'Sports Events',             emoji: '⚽', bucketType: 'wants' },
      { name: 'Sports',                    emoji: '⚽', bucketType: 'wants' },
      { name: 'Museums & Attractions',     emoji: '🏛️', bucketType: 'wants' },
      { name: 'Gambling & Lottery',        emoji: '🎲', bucketType: 'wants' },
      { name: 'Nightlife & Clubs',         emoji: '🎉', bucketType: 'wants' },
    ]),
  },

  // ── Travel ────────────────────────────────────────────────────────────────
  {
    name: 'Travel',
    categories: categoryDefs('expense', [
      { name: 'Flights',                   emoji: '✈️', bucketType: 'wants' },
      { name: 'Hotels & Lodging',          emoji: '🛏️', bucketType: 'wants' },
      { name: 'Car Rental',                emoji: '🚙', bucketType: 'wants' },
      { name: 'Vacation Activities',       emoji: '🌴', bucketType: 'wants' },
      { name: 'Travel Food & Dining',      emoji: '🍜', bucketType: 'wants' },
      { name: 'Travel Insurance',          emoji: '🌍', bucketType: 'wants' },
      { name: 'Passport & Visas',          emoji: '🛂', bucketType: 'wants' },
      { name: 'Luggage & Accessories',     emoji: '🧳', bucketType: 'wants' },
    ]),
  },

  // ── Education & Career ────────────────────────────────────────────────────
  {
    name: 'Education & Career',
    categories: categoryDefs('expense', [
      { name: 'Tuition & University',      emoji: '🎓', bucketType: 'needs', isTaxDeductible: true },
      { name: 'Student Loan Principal',    emoji: '🏫', type: 'transfer', bucketType: 'savings' },
      { name: 'Student Loan Interest',     emoji: '🏫', bucketType: 'needs' },
      { name: 'Online Courses & Training', emoji: '💻', bucketType: 'needs' },
      { name: 'Books & Learning Materials',emoji: '📖', bucketType: 'needs' },
      { name: 'Professional Development',  emoji: '📈', bucketType: 'wants' },
      { name: 'Work Expenses',             emoji: '💼', bucketType: 'needs', isTaxDeductible: true },
      { name: 'Professional Memberships',  emoji: '🏆', bucketType: 'needs', isTaxDeductible: true },
      { name: 'Home Office Supplies',      emoji: '🖊️', bucketType: 'needs', isTaxDeductible: true },
    ]),
  },

  // ── Financial & Savings ───────────────────────────────────────────────────
  {
    name: 'Financial & Savings',
    categories: categoryDefs('expense', [
      { name: 'ABM Cash',                  emoji: '💵', bucketType: 'needs' },
      { name: 'Emergency Fund',            emoji: '🚨', type: 'transfer', bucketType: 'savings' },
      { name: 'RRSP Contribution',         emoji: '💰', type: 'transfer', bucketType: 'savings', isTaxDeductible: true },
      { name: 'TFSA Contribution',         emoji: '🏦', type: 'transfer', bucketType: 'savings' },
      { name: 'RESP Contribution',         emoji: '🎓', type: 'transfer', bucketType: 'savings' },
      { name: 'General Investments',       emoji: '📉', type: 'transfer', bucketType: 'savings' },
      { name: 'Mortgage Principal Payment', emoji: '🏠', type: 'transfer', bucketType: 'savings' },
      { name: 'Mortgage Interest',         emoji: '🏠', bucketType: 'needs' },
      { name: 'Loan/Debt Repayment',       emoji: '💸', type: 'transfer', bucketType: 'savings' },
      { name: 'Credit Card Payment',       emoji: '💳', type: 'transfer', bucketType: 'savings' },
      { name: 'Bank Fees & Interest',      emoji: '🏛️', bucketType: 'needs' },
      { name: 'Life Insurance',            emoji: '📋', bucketType: 'needs' },
      { name: 'Disability Insurance',      emoji: '🩹', bucketType: 'needs' },
      { name: 'Accountant & Tax Prep',     emoji: '🧾', bucketType: 'needs', isTaxDeductible: true },
      { name: 'Financial Advisor',         emoji: '📊', bucketType: 'needs' },
    ]),
  },

  // ── Taxes ─────────────────────────────────────────────────────────────────
  {
    name: 'Taxes',
    categories: categoryDefs('expense', [
      { name: 'Income Tax Owing',          emoji: '🧾', bucketType: 'needs' },
      { name: 'HST / GST / VAT',           emoji: '🏦', bucketType: 'needs' },
      { name: 'Property Transfer Tax',     emoji: '🏛️', bucketType: 'needs' },
      { name: 'Capital Gains Tax',         emoji: '📊', bucketType: 'needs' },
    ]),
  },

  // ── Gifts & Donations ─────────────────────────────────────────────────────
  {
    name: 'Gifts & Donations',
    categories: categoryDefs('expense', [
      { name: 'Charitable Donations',      emoji: '🎗️', bucketType: 'wants', isTaxDeductible: true },
      { name: 'Religious Giving / Tithing',emoji: '⛪', bucketType: 'wants', isTaxDeductible: true },
      { name: 'Birthday & Holiday Gifts',  emoji: '🎂', bucketType: 'wants' },
      { name: 'Wedding & Baby Gifts',      emoji: '💒', bucketType: 'wants' },
      { name: 'Interac e-Transfer Sent',   emoji: '📤', bucketType: 'wants' },
    ]),
  },

  // ── Business (self-employed / side hustle) ────────────────────────────────
  {
    name: 'Business Expenses',
    categories: categoryDefs('expense', [
      { name: 'Advertising & Marketing',   emoji: '📣', bucketType: 'needs', isTaxDeductible: true },
      { name: 'Software & SaaS',           emoji: '💻', bucketType: 'needs', isTaxDeductible: true },
      { name: 'Business Travel',           emoji: '✈️', bucketType: 'needs', isTaxDeductible: true },
      { name: 'Client Entertainment',      emoji: '🍽️', bucketType: 'wants', isTaxDeductible: true },
      { name: 'Office Rent',               emoji: '🏢', bucketType: 'needs', isTaxDeductible: true },
      { name: 'Contractors & Subcontractors',emoji:'👥', bucketType: 'needs', isTaxDeductible: true },
      { name: 'Business Insurance',        emoji: '🛡️', bucketType: 'needs', isTaxDeductible: true },
      { name: 'Equipment & Tools',         emoji: '🔧', bucketType: 'needs', isTaxDeductible: true },
      { name: 'Professional Services',     emoji: '⚖️', bucketType: 'needs', isTaxDeductible: true },
      { name: 'Business Bank Fees',        emoji: '🏦', bucketType: 'needs', isTaxDeductible: true },
    ]),
  },

  // ── Transfers ─────────────────────────────────────────────────────────────
  {
    name: 'Transfers',
    categories: categoryDefs('transfer', [
      { name: 'Internal Transfer',         emoji: '↔️', bucketType: 'savings' },
      { name: 'Cash Deposit',              emoji: '🏧', bucketType: 'savings' },
      { name: 'Balance Adjustment',        emoji: '⚖️', bucketType: 'savings' },
    ]),
  },

  // ── Uncategorized ─────────────────────────────────────────────────────────
  {
    name: 'Uncategorized',
    categories: categoryDefs('expense', [
      { name: 'Uncategorized',             emoji: '❓', bucketType: 'wants' },
    ]),
  },
];

/**
 * Seed the default category groups and categories for a given household.
 * Returns a Map<categoryName, categoryId> for downstream use.
 */
export async function seedDefaultCategories(
  tx: SeedDefaultCategoriesTransaction,
  householdId: string,
): Promise<Map<string, string>> {
  const categoryMap = new Map<string, string>();

  for (let gi = 0; gi < DEFAULT_CATEGORY_GROUPS.length; gi++) {
    const gd = DEFAULT_CATEGORY_GROUPS[gi];
    const group = await tx.categoryGroup.create({
      data: {
        householdId,
        name: gd.name,
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
          type: cd.type,
          groupId: group.id,
          sortOrder: ci,
          bucketType: cd.bucketType,
          isTaxDeductible: cd.isTaxDeductible ?? false,
        },
      });
      categoryMap.set(cd.name, cat.id);
    }
  }

  return categoryMap;
}
