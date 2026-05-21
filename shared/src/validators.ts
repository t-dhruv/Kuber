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

type UnknownRecord = Record<string, unknown>;

function isRecord(x: unknown): x is UnknownRecord {
  return !!x && typeof x === 'object';
}

function hasStringProperty(x: UnknownRecord, key: string): boolean {
  return typeof x[key] === 'string';
}

// Simple runtime guards (non-invasive). These rely on basic shape checks and do not enforce all fields.
export function isUserDto(x: unknown): x is UserDto {
  return isRecord(x) && hasStringProperty(x, 'id') && hasStringProperty(x, 'email');
}

export function isAccountDto(x: unknown): x is AccountDto {
  return isRecord(x) && hasStringProperty(x, 'id') && hasStringProperty(x, 'name');
}

export function isTransactionDto(x: unknown): x is TransactionDto {
  return isRecord(x) && hasStringProperty(x, 'id') && typeof x.amount === 'number';
}

export function isCategoryDto(x: unknown): x is CategoryDto {
  return isRecord(x) && hasStringProperty(x, 'id') && hasStringProperty(x, 'name');
}

export function isBudgetDto(x: unknown): x is BudgetDto {
  return isRecord(x) && hasStringProperty(x, 'id') && hasStringProperty(x, 'categoryId');
}

export function isGoalDto(x: unknown): x is GoalDto {
  return isRecord(x) && hasStringProperty(x, 'id') && hasStringProperty(x, 'name');
}

export function isRecurringItemDto(x: unknown): x is RecurringItemDto {
  return isRecord(x) && hasStringProperty(x, 'id') && hasStringProperty(x, 'name');
}

export function isInvestmentHoldingDto(x: unknown): x is InvestmentHoldingDto {
  return isRecord(x) && hasStringProperty(x, 'id') && hasStringProperty(x, 'symbol');
}

export function isNotificationDto(x: unknown): x is NotificationDto {
  return isRecord(x) && hasStringProperty(x, 'id') && hasStringProperty(x, 'title');
}

export function isReportOverviewDto(x: unknown): x is ReportOverviewDto {
  return isRecord(x) && typeof x.cashFlow === 'object' && x.cashFlow !== null;
}

// Generic API response guard
export function isApiResponse<T>(x: unknown, guard: (v: unknown) => v is T): x is { data: T; message?: string } {
  return isRecord(x) && typeof x.data !== 'undefined' && guard(x.data);
}
