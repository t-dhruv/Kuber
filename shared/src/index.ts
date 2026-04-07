// Core enums
export type AccountType = 'checking' | 'savings' | 'credit' | 'investment' | 'loan' | 'property' | 'other';
export type CategoryType = 'income' | 'expense';
export type GoalType = 'save_up' | 'pay_down';
export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';
export type AssetClass = 'us_stock' | 'intl_stock' | 'bond' | 'real_estate' | 'cash' | 'crypto' | 'commodity' | 'other';
export type HouseholdRole = 'owner' | 'member' | 'viewer';

// Core DTOs
export interface UserDto { id: string; email: string; firstName: string; lastName: string; avatar: string | null; timezone: string; theme: 'light' | 'dark' | 'system'; householdId: string; }
export interface AccountDto { id: string; name: string; type: AccountType; institution: string | null; lastFour: string | null; balance: number; currency: string; creditLimit: number | null; availableCredit: number | null; isHidden: boolean; excludeFromNetWorth: boolean; lastSynced: string | null; }
export interface TransactionDto { id: string; date: string; description: string; originalDescription: string; amount: number; categoryId: string | null; categoryName: string | null; categoryEmoji: string | null; accountId: string; accountName: string; merchantId: string | null; merchantName: string | null; notes: string | null; tags: string[]; isRecurring: boolean; needsReview: boolean; isHidden: boolean; isSplit: boolean; }
export interface CategoryDto { id: string; name: string; emoji: string | null; type: CategoryType; groupId: string | null; groupName: string | null; sortOrder: number; }
export interface BudgetDto { id: string; categoryId: string; categoryName: string; categoryEmoji: string | null; amount: number; actual: number; remaining: number; rollover: boolean; rolloverAmount: number; }
export interface GoalDto { id: string; name: string; type: GoalType; targetAmount: number; currentAmount: number; targetDate: string | null; monthlyContribution: number; icon: string | null; status: 'on_track' | 'at_risk' | 'completed'; progressPercent: number; }
export interface RecurringItemDto { id: string; name: string; amount: number; frequency: RecurringFrequency; nextDate: string; accountId: string; accountName: string; categoryId: string | null; categoryName: string | null; isAutopay: boolean; isActive: boolean; }
export interface InvestmentHoldingDto { id: string; symbol: string; name: string; shares: number; costBasis: number; currentPrice: number; currentValue: number; gainLoss: number; gainLossPercent: number; assetClass: AssetClass; }
export interface NotificationDto { id: string; type: string; title: string; body: string; isRead: boolean; createdAt: string; }
export interface ApiResponse<T> { data: T; message?: string; }
export interface PaginatedResponse<T> { data: T[]; total: number; cursor: string | null; hasMore: boolean; }
