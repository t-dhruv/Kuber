/**
 * iconAssignmentJob.ts
 *
 * Cron job: Assigns Lucide icon IDs to categories that don't have one.
 * Uses category name → icon mapping.
 *
 * Run via: POST /api/v1/cron/jobs/icon-assignment/trigger
 * Also runs daily via setInterval in index.ts.
 */

import { prisma } from './prisma.js';

// Category name → Lucide icon mapping (covers default categories by name)
const NAME_TO_ICON: Record<string, string> = {
  'Salary & Wages': 'briefcase',
  'Freelance & Consulting': 'laptop',
  'Rental Income': 'home',
  'Business Income': 'briefcase',
  'Investment Dividends': 'trending-up',
  'Capital Gains': 'trending-up',
  'Government Benefits': 'landmark',
  'Pension & Retirement': 'piggy-bank',
  'Side Hustle': 'hammer',
  'Gifts & Bonuses': 'gift',
  'Tax Refund': 'credit-card',
  'Reimbursements': 'dollar-sign',
  'Interest Income': 'piggy-bank',
  'Other Income': 'plus',
  'Rent & Mortgage': 'home',
  'Strata / HOA Fees': 'building',
  'Property Taxes': 'landmark',
  'Home Maintenance & Repairs': 'wrench',
  'Home Renovations': 'hammer',
  'Electricity / Hydro': 'zap',
  'Water & Sewage': 'droplet',
  'Natural Gas / Heating': 'flame',
  'Internet': 'wifi',
  'Phone Plan': 'smartphone',
  'Cable / Satellite TV': 'tv',
  'Home Insurance': 'shield',
  'Security System': 'lock',
  'Lawn & Garden': 'leaf',
  'Cleaning & Housekeeping': 'sparkles',
  'Furniture & Appliances': 'sofa',
  'Groceries': 'shopping-cart',
  'Restaurants': 'utensils',
  'Fast Food': 'utensils',
  'Coffee Shops': 'coffee',
  'Takeout & Delivery': 'utensils',
  'Alcohol & Bars': 'beer',
  'Work Lunches': 'utensils',
  'Fuel & Gas': 'car',
  'Public Transit': 'bus',
  'Rideshare & Taxi': 'car',
  'Auto Insurance': 'shield',
  'Car Maintenance & Repairs': 'wrench',
  'Car Payment / Lease': 'car',
  'Parking & Tolls': 'car',
  'Registration & Licensing': 'id-card',
  'Bicycle & Scooter': 'bike',
  'Doctor & Specialists': 'stethoscope',
  'Pharmacy & Medications': 'pill',
  'Dental': 'tooth',
  'Vision & Optometry': 'eye',
  'Mental Health & Therapy': 'brain',
  'Gym & Fitness': 'dumbbell',
  'Yoga & Wellness': 'brain',
  'Hair & Beauty': 'scissors',
  'Toiletries & Hygiene': 'sparkles',
  'Vitamins & Supplements': 'pill',
  'Health Insurance': 'shield',
  'Childcare & Daycare': 'baby',
  'School Fees & Supplies': 'book-open',
  'Extracurricular Activities': 'music',
  'Toys & Kids Activities': 'gamepad2',
  'Baby & Infant': 'baby',
  'Pet Food & Supplies': 'paw-print',
  'Vet & Pet Medications': 'paw-print',
  'Pet Insurance': 'shield',
  'Pet Grooming': 'paw-print',
  'Elder Care': 'users',
  'Clothing & Apparel': 'shirt',
  'Shoes & Accessories': 'shoe-prints',
  'Electronics & Gadgets': 'laptop',
  'Books & Magazines': 'book-open',
  'Online Shopping': 'shopping-cart',
  'Home Goods & Décor': 'home',
  'Sports & Outdoor Gear': 'dumbbell',
  'Subscriptions': 'refresh-cw',
  'Hobbies & Crafts': 'palette',
  'Gifts Given': 'gift',
  'Movies & Streaming': 'film',
  'Music & Concerts': 'music',
  'Video Games': 'gamepad2',
  'Events & Tickets': 'ticket',
  'Sports Events': 'dumbbell',
  'Museums & Attractions': 'landmark',
  'Gambling & Lottery': 'dice',
  'Nightlife & Clubs': 'star',
  'Flights': 'plane',
  'Hotels & Lodging': 'hotel',
  'Car Rental': 'car',
  'Vacation Activities': 'palette',
  'Travel Food & Dining': 'utensils',
  'Travel Insurance': 'shield',
  'Passport & Visas': 'id-card',
  'Luggage & Accessories': 'briefcase',
  'Tuition & University': 'graduation-cap',
  'Student Loan Payments': 'landmark',
  'Online Courses & Training': 'laptop',
  'Books & Learning Materials': 'book-open',
  'Professional Development': 'trending-up',
  'Work Expenses': 'briefcase',
  'Professional Memberships': 'award',
  'Home Office Supplies': 'laptop',
  'Emergency Fund': 'alert-triangle',
  'RRSP / 401(k) Contribution': 'piggy-bank',
  'TFSA / Roth IRA': 'credit-card',
  'RESP / Education Savings': 'graduation-cap',
  'General Investments': 'trending-down',
  'Mortgage Payment': 'home',
  'Loan / Debt Repayment': 'dollar-sign',
  'Credit Card Payment': 'credit-card',
  'Bank Fees & Interest': 'landmark',
  'Life Insurance': 'file-text',
  'Disability Insurance': 'activity',
  'Accountant & Tax Prep': 'file-text',
  'Financial Advisor': 'bar-chart-2',
  'Income Tax Owing': 'file-text',
  'HST / GST / VAT': 'credit-card',
  'Property Transfer Tax': 'landmark',
  'Capital Gains Tax': 'bar-chart-2',
  'Charitable Donations': 'gift',
  'Religious Giving / Tithing': 'gift',
  'Birthday & Holiday Gifts': 'gift',
  'Wedding & Baby Gifts': 'gift',
  'Advertising & Marketing': 'megaphone',
  'Software & SaaS': 'laptop',
  'Business Travel': 'plane',
  'Client Entertainment': 'utensils',
  'Office Rent': 'building',
  'Contractors & Subcontractors': 'users',
  'Business Insurance': 'shield',
  'Equipment & Tools': 'wrench',
  'Professional Services': 'briefcase',
  'Business Bank Fees': 'landmark',
  'Internal Transfer': 'arrow-left-right',
  'Balance Adjustment': 'briefcase',
  'e-Transfer Sent': 'arrow-up-right',
  'e-Transfer Received': 'arrow-down-left',
  'Uncategorized': 'help-circle',
};

export interface IconAssignmentResult {
  assigned: number;
  skipped: number;
}

/**
 * Assign icons to categories that don't have one.
 * Priority: name mapping → skip.
 */
export async function runIconAssignmentJob(): Promise<IconAssignmentResult> {
  let assigned = 0;
  let skipped = 0;

  const categories = await prisma.category.findMany({
    where: {
      OR: [{ icon: null }, { icon: '' }],
    },
    select: { id: true, name: true },
  });

  for (const cat of categories) {
    const iconId = NAME_TO_ICON[cat.name];

    if (iconId) {
      await prisma.category.update({
        where: { id: cat.id },
        data: { icon: iconId },
      });
      assigned++;
    } else {
      skipped++;
    }
  }

  return { assigned, skipped };
}
