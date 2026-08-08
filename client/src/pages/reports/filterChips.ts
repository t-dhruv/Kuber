import type { ActiveFilter } from "@/components/ui";
import {
  DEFAULT_STANDARD_FILTERS,
  TRANSACTION_TYPE_OPTIONS,
  type StandardReportFilters,
  type StandardReportOptions,
} from "./standardReportClient";

/** Identity filters render as `Label: Name` for one selection, `Label: N selected` beyond that. */
type IdentityField = "accountIds" | "categoryIds" | "categoryGroupIds" | "budgetIds" | "tagIds" | "merchantIds";

const IDENTITY_LABELS: Record<IdentityField, string> = {
  accountIds: "Accounts",
  categoryIds: "Categories",
  categoryGroupIds: "Category Groups",
  budgetIds: "Budgets",
  tagIds: "Tags",
  merchantIds: "Merchants",
};

type BooleanField =
  | "includePending"
  | "includeTransfers"
  | "includeHidden"
  | "includeSplits"
  | "includeExcludedFromReports"
  | "onlyUncategorized";

const BOOLEAN_CHIPS: Record<BooleanField, { label: string; whenTrue: string; whenFalse: string }> = {
  includePending: { label: "Pending", whenTrue: "Included", whenFalse: "Excluded" },
  includeTransfers: { label: "Transfers", whenTrue: "Included", whenFalse: "Excluded" },
  includeHidden: { label: "Hidden", whenTrue: "Included", whenFalse: "Excluded" },
  includeSplits: { label: "Splits", whenTrue: "Included", whenFalse: "Excluded" },
  includeExcludedFromReports: { label: "Excluded from reports", whenTrue: "Included", whenFalse: "Excluded" },
  onlyUncategorized: { label: "Uncategorized", whenTrue: "Only", whenFalse: "All" },
};

const COMPARISON_LABELS: Record<StandardReportFilters["comparisonMode"], string> = {
  none: "None",
  previous_period: "Previous period",
  previous_year: "Previous year",
};

const RECONCILED_LABELS: Record<StandardReportFilters["reconciledState"], string> = {
  any: "Any",
  reconciled: "Reconciled",
  unreconciled: "Unreconciled",
};

/** Names for each identity field, keyed by entity id, taken from the loaded report options. */
function identityNames(
  field: IdentityField,
  options: StandardReportOptions | undefined,
): Map<string, string> {
  const source =
    field === "accountIds"
      ? options?.accounts
      : field === "categoryIds"
        ? options?.categories
        : field === "categoryGroupIds"
          ? options?.categoryGroups
          : field === "budgetIds"
            ? options?.budgets
            : field === "tagIds"
              ? options?.tags
              : options?.merchants;

  return new Map((source ?? []).map((entity) => [entity.id, entity.name]));
}

function formatAmount(value: number): string {
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(2);

  return `$${formatted}`;
}

function amountChipValue(min: number | undefined, max: number | undefined): string | undefined {
  if (min !== undefined && max !== undefined) return `${formatAmount(min)} – ${formatAmount(max)}`;
  if (min !== undefined) return `≥ ${formatAmount(min)}`;
  if (max !== undefined) return `≤ ${formatAmount(max)}`;

  return undefined;
}

/**
 * One chip per filter that differs from its default. Chip `id` is the filter field name,
 * except the two amount bounds which share the single id `amount`.
 *
 * Tab, date range and `groupBy` never chip — they have dedicated always-visible controls.
 */
export function activeFilterChips(
  filters: StandardReportFilters,
  options: StandardReportOptions | undefined,
): ActiveFilter[] {
  const chips: ActiveFilter[] = [];

  for (const field of Object.keys(IDENTITY_LABELS) as IdentityField[]) {
    const selected = filters[field] ?? [];

    if (!selected.length) continue;

    const names = identityNames(field, options);
    const resolved = selected.length === 1 ? names.get(selected[0]) : undefined;

    chips.push({
      id: field,
      label: IDENTITY_LABELS[field],
      // Falls back to the count when options have not loaded yet.
      value: resolved ?? `${selected.length} selected`,
    });
  }

  if (filters.transactionTypes?.length) {
    const labels = filters.transactionTypes.map(
      (type) => TRANSACTION_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type,
    );

    chips.push({
      id: "transactionTypes",
      label: "Types",
      value: labels.length === 1 ? labels[0] : `${labels.length} selected`,
    });
  }

  if (filters.currencyCode) {
    chips.push({ id: "currencyCode", label: "Currency", value: filters.currencyCode.toUpperCase() });
  }

  for (const field of Object.keys(BOOLEAN_CHIPS) as BooleanField[]) {
    if (filters[field] === DEFAULT_STANDARD_FILTERS[field]) continue;

    const chip = BOOLEAN_CHIPS[field];

    chips.push({
      id: field,
      label: chip.label,
      value: filters[field] ? chip.whenTrue : chip.whenFalse,
    });
  }

  if (filters.reconciledState !== DEFAULT_STANDARD_FILTERS.reconciledState) {
    chips.push({ id: "reconciledState", label: "Reconciled", value: RECONCILED_LABELS[filters.reconciledState] });
  }

  const amountValue = amountChipValue(filters.minAmount, filters.maxAmount);

  if (amountValue) chips.push({ id: "amount", label: "Amount", value: amountValue });

  if (filters.searchText) {
    chips.push({ id: "searchText", label: "Search", value: `"${filters.searchText}"` });
  }

  if (filters.comparisonMode !== DEFAULT_STANDARD_FILTERS.comparisonMode) {
    chips.push({ id: "comparisonMode", label: "Compare", value: COMPARISON_LABELS[filters.comparisonMode] });
  }

  if (filters.sortBy) {
    chips.push({ id: "sortBy", label: "Sort", value: filters.sortBy });
  }

  if (filters.sortDirection !== DEFAULT_STANDARD_FILTERS.sortDirection) {
    chips.push({ id: "sortDirection", label: "Order", value: "Ascending" });
  }

  if (filters.limit !== DEFAULT_STANDARD_FILTERS.limit) {
    chips.push({ id: "limit", label: "Rows", value: String(filters.limit) });
  }

  return chips;
}

/** Reset one filter (by the chip id above) to its default. */
export function clearFilter(filters: StandardReportFilters, id: string): StandardReportFilters {
  if (id === "amount") return { ...filters, minAmount: undefined, maxAmount: undefined };
  if (id === "currencyCode") return { ...filters, currencyCode: undefined };
  if (id === "searchText") return { ...filters, searchText: undefined };
  if (id === "sortBy") return { ...filters, sortBy: undefined };

  if (id in DEFAULT_STANDARD_FILTERS) {
    const key = id as keyof typeof DEFAULT_STANDARD_FILTERS;

    return { ...filters, [key]: DEFAULT_STANDARD_FILTERS[key] };
  }

  return filters;
}

/** Reset every filter except tab, date range and groupBy. */
export function clearAllFilters(filters: StandardReportFilters): StandardReportFilters {
  return {
    ...filters,
    ...DEFAULT_STANDARD_FILTERS,
    groupBy: filters.groupBy,
    currencyCode: undefined,
    sortBy: undefined,
    minAmount: undefined,
    maxAmount: undefined,
    searchText: undefined,
  };
}
