/**
 * iconAssignmentJob.ts
 *
 * Cron job: Assigns emoji icons to categories that don't have one,
 * or that still have a legacy Lucide slug (ASCII-only string).
 *
 * Run via: POST /api/v1/cron/jobs/icon-assignment/trigger
 * Also runs daily via setInterval in index.ts.
 */

import { prisma } from './prisma.js';

const NAME_TO_EMOJI: Record<string, string> = {
  // Income
  'Salary & Wages': '💼',
  'Freelance & Consulting': '💻',
  'Rental Income': '🏠',
  'Business Income': '🏢',
  'Investment Dividends': '📈',
  'Capital Gains': '📈',
  'Government Benefits': '🏛️',
  'Pension & Retirement': '🏦',
  'Side Hustle': '⚡',
  'Gifts & Bonuses': '🎁',
  'Tax Refund': '💵',
  'Reimbursements': '💵',
  'Interest Income': '💰',
  'Other Income': '💰',
  // Housing
  'Rent & Mortgage': '🏠',
  'Strata / HOA Fees': '🏘️',
  'Property Taxes': '🏛️',
  'Home Maintenance & Repairs': '🔧',
  'Home Renovations': '🏗️',
  'Electricity / Hydro': '⚡',
  'Water & Sewage': '💧',
  'Natural Gas / Heating': '🔥',
  'Internet': '🌐',
  'Phone Plan': '📱',
  'Cable / Satellite TV': '📺',
  'Home Insurance': '🛡️',
  'Security System': '🔒',
  'Lawn & Garden': '🪴',
  'Cleaning & Housekeeping': '🧹',
  'Furniture & Appliances': '🛋️',
  // Food & drink
  'Groceries': '🛒',
  'Restaurants': '🍽️',
  'Fast Food': '🍔',
  'Coffee Shops': '☕',
  'Takeout & Delivery': '🥡',
  'Alcohol & Bars': '🍺',
  'Work Lunches': '🥗',
  // Transport
  'Fuel & Gas': '⛽',
  'Public Transit': '🚌',
  'Rideshare & Taxi': '🚕',
  'Auto Insurance': '🛡️',
  'Car Maintenance & Repairs': '🔧',
  'Car Payment / Lease': '🚗',
  'Parking & Tolls': '🅿️',
  'Registration & Licensing': '📋',
  'Bicycle & Scooter': '🚲',
  // Health
  'Doctor & Specialists': '🩺',
  'Pharmacy & Medications': '💊',
  'Dental': '🦷',
  'Vision & Optometry': '👁️',
  'Mental Health & Therapy': '🧠',
  'Gym & Fitness': '🏋️',
  'Yoga & Wellness': '🧘',
  'Hair & Beauty': '✂️',
  'Toiletries & Hygiene': '🪥',
  'Vitamins & Supplements': '💊',
  'Health Insurance': '🛡️',
  // Family & kids
  'Childcare & Daycare': '👶',
  'School Fees & Supplies': '📚',
  'Extracurricular Activities': '🎵',
  'Toys & Kids Activities': '🎮',
  'Baby & Infant': '👶',
  // Pets
  'Pet Food & Supplies': '🐾',
  'Vet & Pet Medications': '🐾',
  'Pet Insurance': '🛡️',
  'Pet Grooming': '🐾',
  // Family care
  'Elder Care': '👥',
  // Shopping
  'Clothing & Apparel': '👗',
  'Shoes & Accessories': '👟',
  'Electronics & Gadgets': '💻',
  'Books & Magazines': '📚',
  'Online Shopping': '🛒',
  'Home Goods & Décor': '🏠',
  'Sports & Outdoor Gear': '🏋️',
  'Subscriptions': '🔄',
  'Hobbies & Crafts': '🎨',
  'Gifts Given': '🎁',
  // Entertainment
  'Movies & Streaming': '🎬',
  'Music & Concerts': '🎵',
  'Video Games': '🎮',
  'Events & Tickets': '🎟️',
  'Sports Events': '⚽',
  'Museums & Attractions': '🏛️',
  'Gambling & Lottery': '🎲',
  'Nightlife & Clubs': '🌙',
  // Travel
  'Flights': '✈️',
  'Hotels & Lodging': '🏨',
  'Car Rental': '🚗',
  'Vacation Activities': '🏖️',
  'Travel Food & Dining': '🍽️',
  'Travel Insurance': '🛡️',
  'Passport & Visas': '🛂',
  'Luggage & Accessories': '🧳',
  // Education
  'Tuition & University': '🎓',
  'Student Loan Payments': '🏛️',
  'Online Courses & Training': '💻',
  'Books & Learning Materials': '📚',
  'Professional Development': '📈',
  // Work
  'Work Expenses': '💼',
  'Professional Memberships': '🏅',
  'Home Office Supplies': '💻',
  // Savings & investments
  'Emergency Fund': '⚠️',
  'RRSP / 401(k) Contribution': '🏦',
  'TFSA / Roth IRA': '💳',
  'RESP / Education Savings': '🎓',
  'General Investments': '📈',
  // Debt & finance
  'Mortgage Payment': '🏠',
  'Loan / Debt Repayment': '💵',
  'Credit Card Payment': '💳',
  'Bank Fees & Interest': '🏦',
  'Life Insurance': '📋',
  'Disability Insurance': '🛡️',
  'Accountant & Tax Prep': '📋',
  'Financial Advisor': '📊',
  'Income Tax Owing': '📋',
  'HST / GST / VAT': '💳',
  'Property Transfer Tax': '🏛️',
  'Capital Gains Tax': '📊',
  // Giving
  'Charitable Donations': '❤️',
  'Religious Giving / Tithing': '⛪',
  'Birthday & Holiday Gifts': '🎁',
  'Wedding & Baby Gifts': '🎁',
  // Business
  'Advertising & Marketing': '📣',
  'Software & SaaS': '💻',
  'Business Travel': '✈️',
  'Client Entertainment': '🍽️',
  'Office Rent': '🏢',
  'Contractors & Subcontractors': '👥',
  'Business Insurance': '🛡️',
  'Equipment & Tools': '🔧',
  'Professional Services': '💼',
  'Business Bank Fees': '🏦',
  // Transfers
  'Internal Transfer': '↔️',
  'Balance Adjustment': '⚖️',
  'e-Transfer Sent': '↗️',
  'e-Transfer Received': '↙️',
  'Uncategorized': '❓',
};

/** Returns true if the value looks like a legacy Lucide slug (ASCII-only, e.g. "shopping-cart") */
function isLegacySlug(icon: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(icon);
}

export interface IconAssignmentResult {
  assigned: number;
  skipped: number;
}

export async function runIconAssignmentJob(): Promise<IconAssignmentResult> {
  let assigned = 0;
  let skipped = 0;

  const categories = await prisma.category.findMany({
    select: { id: true, name: true, icon: true },
  });

  for (const cat of categories) {
    const needsEmoji = !cat.icon || cat.icon === '' || isLegacySlug(cat.icon);
    if (!needsEmoji) {
      skipped++;
      continue;
    }

    const emoji = NAME_TO_EMOJI[cat.name];
    if (emoji) {
      await prisma.category.update({
        where: { id: cat.id },
        data: { icon: emoji },
      });
      assigned++;
    } else {
      skipped++;
    }
  }

  return { assigned, skipped };
}
