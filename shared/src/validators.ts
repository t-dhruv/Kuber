import type { UserDto } from './dtos';
import type { AccountDto } from './dtos';
import type { TransactionDto } from './dtos';
import type { CategoryDto } from './dtos';
import type { BudgetDto } from './dtos';
import type { GoalDto } from './dtos';
import type { RecurringItemDto } from './dtos';
import type { InvestmentHoldingDto } from './dtos';
import type { NotificationDto } from './dtos';
import type { ReportOverviewDto } from './dtos';

// Simple runtime guards (non-invasive). These rely on basic shape checks and do not enforce all fields.
export function isUserDto(x: unknown): x is UserDto {
  return !!x && typeof (x as any).id === 'string' && typeof (x as any).email === 'string';
}

export function isAccountDto(x: unknown): x is AccountDto {
  return !!x && typeof (x as any).id === 'string' && typeof (x as any).name === 'string';
}

export function isTransactionDto(x: unknown): x is TransactionDto {
  return !!x && typeof (x as any).id === 'string' && typeof (x as any).amount === 'number';
}

export function isCategoryDto(x: unknown): x is CategoryDto {
  return !!x && typeof (x as any).id === 'string' && typeof (x as any).name === 'string';
}

export function isBudgetDto(x: unknown): x is BudgetDto {
  return !!x && typeof (x as any).id === 'string' && typeof (x as any).categoryId === 'string';
}

export function isGoalDto(x: unknown): x is GoalDto {
  return !!x && typeof (x as any).id === 'string' && typeof (x as any).name === 'string';
}

export function isRecurringItemDto(x: unknown): x is RecurringItemDto {
  return !!x && typeof (x as any).id === 'string' && typeof (x as any).name === 'string';
}

export function isInvestmentHoldingDto(x: unknown): x is InvestmentHoldingDto {
  return !!x && typeof (x as any).id === 'string' && typeof (x as any).symbol === 'string';
}

export function isNotificationDto(x: unknown): x is NotificationDto {
  return !!x && typeof (x as any).id === 'string' && typeof (x as any).title === 'string';
}

export function isReportOverviewDto(x: unknown): x is ReportOverviewDto {
  return !!x && typeof (x as any).cashFlow === 'object';
}

// Generic API response guard
export function isApiResponse<T>(x: unknown, guard: (v: unknown) => v is T): x is { data: T; message?: string } {
  return !!x && typeof (x as any).data !== 'undefined' && guard((x as any).data);
}
