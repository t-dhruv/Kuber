import type { AccountType } from './types';
import type { CategoryType } from './types';
import type { GoalType } from './types';
import type { RecurringFrequency } from './types';
import type { AssetClass } from './types';

/** User data transfer object (client-side). */
/** User data transfer object. */
export interface UserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  timezone: string;
  theme: 'light' | 'dark' | 'system';
  householdId: string;
}

/** Bank account representation. */
/** Account data transfer object. */
export interface AccountDto {
  id: string;
  name: string;
  type: AccountType;
  institution: string | null;
  lastFour: string | null;
  balance: number;
  currency: string;
  creditLimit: number | null;
  availableCredit: number | null;
  isHidden: boolean;
  excludeFromNetWorth: boolean;
  lastSynced: string | null;
}

/** Financial transaction record. */
/** Transaction data transfer object. */
export interface TransactionDto {
  id: string;
  date: string;
  description: string;
  originalDescription: string;
  amount: number;
  categoryId: string | null;
  categoryName: string | null;
  categoryEmoji: string | null;
  accountId: string;
  accountName: string;
  merchantId: string | null;
  merchantName: string | null;
  notes: string | null;
  tags: string[];
  isRecurring: boolean;
  needsReview: boolean;
  isHidden: boolean;
  isSplit: boolean;
}

/** Category definition used across transactions and budgets. */
/** Category data transfer object. */
export interface CategoryDto {
  id: string;
  name: string;
  emoji: string | null;
  type: CategoryType;
  groupId: string | null;
  groupName: string | null;
  sortOrder: number;
}

/** Budget per category or grouping. */
/** Budget data transfer object. */
export interface BudgetDto {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryEmoji: string | null;
  amount: number;
  actual: number;
  remaining: number;
  rollover: boolean;
  rolloverAmount: number;
}

/** Goal for user financial target (savings, payoff). */
/** Goal data transfer object. */
export interface GoalDto {
  id: string;
  name: string;
  type: GoalType;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
  monthlyContribution: number;
  icon: string | null;
  status: 'on_track' | 'at_risk' | 'completed';
  progressPercent: number;
}

/** Recurring item (bill, subscription). */
/** Recurring item data transfer object. */
export interface RecurringItemDto {
  id: string;
  name: string;
  amount: number;
  frequency: RecurringFrequency;
  nextDate: string;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  isAutopay: boolean;
  isActive: boolean;
}

/** Investment holding details. */
/** Investment holding data transfer object. */
export interface InvestmentHoldingDto {
  id: string;
  symbol: string;
  name: string;
  shares: number;
  costBasis: number;
  currentPrice: number;
  currentValue: number;
  gainLoss: number;
  gainLossPercent: number;
  assetClass: AssetClass;
}

/** Notification payload for user alerts. */
/** Notification data transfer object. */
export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

/** Summary view of reports data. */
/** Report overview DTO used by overview endpoints. */
export interface ReportOverviewDto {
  cashFlow: { income: number; expense: number; transferTotal: number; savingsRate: number };
  netWorth: { total: number };
  investments: { portfolioValue: number };
  taxes: { realizedGains: number; taxDrag: number };
  goals: { savingsRate: number };
  diagnostics: { unmatchedTransfers: number; missingPrices: number; duplicateTransactions: number };
}

/** Client-side only — server returns data directly (no wrapper). Do not use in server route responses. */
export interface ApiResponse<T> { data: T; message?: string; }
export interface PaginatedResponse<T> { data: T[]; total: number; cursor: string | null; hasMore: boolean; }
