import { useMemo } from "react";
import { Input, SegmentControl } from "@/components/ui";
import {
  TRANSACTION_TYPE_OPTIONS,
  type StandardReportFilters,
  type StandardReportOptions,
} from "../standardReportClient";
import { FilterField, NativeSelect, SearchableMultiSelect, ToggleField } from "./filterControls";

interface AdvancedFilterPanelProps {
  filters: StandardReportFilters;
  options: StandardReportOptions | undefined;
  onChange: (next: StandardReportFilters) => void;
}

const COMPARISON_OPTIONS = [
  { value: "none", label: "None" },
  { value: "previous_period", label: "Previous period" },
  { value: "previous_year", label: "Previous year" },
];

const RECONCILED_OPTIONS: Array<{ value: StandardReportFilters["reconciledState"]; label: string }> = [
  { value: "any", label: "Any" },
  { value: "reconciled", label: "Reconciled" },
  { value: "unreconciled", label: "Unreconciled" },
];

/** Parses a numeric input, treating an empty field as "no bound" rather than zero. */
function parseBound(raw: string): number | undefined {
  if (!raw.trim()) return undefined;

  const parsed = Number(raw);

  return Number.isFinite(parsed) ? parsed : undefined;
}

export function AdvancedFilterPanel({ filters, options, onChange }: AdvancedFilterPanelProps) {
  const set = <K extends keyof StandardReportFilters>(key: K, value: StandardReportFilters[K]) => {
    onChange({ ...filters, [key]: value });
  };

  const currencies = useMemo(() => {
    const values = new Set((options?.accounts ?? []).map((account) => account.currency).filter(Boolean));

    return Array.from(values).sort();
  }, [options?.accounts]);

  return (
    <div
      style={{
        display: "grid",
        gap: "1rem",
        marginTop: "0.75rem",
        paddingTop: "1rem",
        borderTop: "1px solid var(--color-border)",
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <FilterField label="Accounts">
          <SearchableMultiSelect
            value={filters.accountIds}
            options={(options?.accounts ?? []).map((account) => ({ label: account.name, value: account.id }))}
            placeholder="All accounts"
            searchPlaceholder="Search accounts..."
            emptyMessage="No accounts found"
            onChange={(value) => set("accountIds", value)}
          />
        </FilterField>

        <FilterField label="Categories">
          <SearchableMultiSelect
            value={filters.categoryIds}
            options={(options?.categories ?? []).map((category) => ({ label: category.name, value: category.id }))}
            placeholder="All categories"
            searchPlaceholder="Search categories..."
            emptyMessage="No categories found"
            onChange={(value) => set("categoryIds", value)}
          />
        </FilterField>

        <FilterField label="Category Groups">
          <SearchableMultiSelect
            value={filters.categoryGroupIds}
            options={(options?.categoryGroups ?? []).map((group) => ({ label: group.name, value: group.id }))}
            placeholder="All category groups"
            searchPlaceholder="Search category groups..."
            emptyMessage="No category groups found"
            onChange={(value) => set("categoryGroupIds", value)}
          />
        </FilterField>

        <FilterField label="Budgets">
          <SearchableMultiSelect
            value={filters.budgetIds}
            options={(options?.budgets ?? []).map((budget) => ({ label: budget.name, value: budget.id }))}
            placeholder="All budgets"
            searchPlaceholder="Search budgets..."
            emptyMessage="No budgets found"
            onChange={(value) => set("budgetIds", value)}
          />
        </FilterField>

        <FilterField label="Tags">
          <SearchableMultiSelect
            value={filters.tagIds}
            options={(options?.tags ?? []).map((tag) => ({ label: tag.name, value: tag.id }))}
            placeholder="All tags"
            searchPlaceholder="Search tags..."
            emptyMessage="No tags found"
            onChange={(value) => set("tagIds", value)}
          />
        </FilterField>

        <FilterField label="Merchants">
          <SearchableMultiSelect
            value={filters.merchantIds}
            options={(options?.merchants ?? []).map((merchant) => ({ label: merchant.name, value: merchant.id }))}
            placeholder="All merchants"
            searchPlaceholder="Search merchants..."
            emptyMessage="No merchants found"
            onChange={(value) => set("merchantIds", value)}
          />
        </FilterField>

        <FilterField label="Transaction Types">
          <SearchableMultiSelect
            value={filters.transactionTypes}
            options={TRANSACTION_TYPE_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
            placeholder="All types"
            searchPlaceholder="Search types..."
            emptyMessage="No transaction types found"
            onChange={(value) => set("transactionTypes", value)}
          />
        </FilterField>

        <FilterField label="Currency">
          <NativeSelect
            value={filters.currencyCode ?? ""}
            placeholder="All currencies"
            ariaLabel="Currency"
            onChange={(value) => set("currencyCode", value || undefined)}
            options={currencies.map((currency) => ({ value: currency, label: currency }))}
          />
        </FilterField>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <ToggleField
          label="Pending"
          checked={filters.includePending}
          onChange={(checked) => set("includePending", checked)}
        />

        <ToggleField
          label="Transfers"
          checked={filters.includeTransfers}
          onChange={(checked) => set("includeTransfers", checked)}
        />

        <ToggleField
          label="Hidden"
          checked={filters.includeHidden}
          onChange={(checked) => set("includeHidden", checked)}
        />

        <ToggleField
          label="Splits"
          checked={filters.includeSplits}
          onChange={(checked) => set("includeSplits", checked)}
        />

        <ToggleField
          label="Excluded from reports"
          checked={filters.includeExcludedFromReports}
          onChange={(checked) => set("includeExcludedFromReports", checked)}
        />

        <ToggleField
          label="Uncategorized only"
          checked={filters.onlyUncategorized}
          onChange={(checked) => set("onlyUncategorized", checked)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <FilterField label="Reconciled">
          <div>
            <SegmentControl
              options={RECONCILED_OPTIONS}
              value={filters.reconciledState}
              onChange={(value) => set("reconciledState", value)}
              size="sm"
            />
          </div>
        </FilterField>

        <FilterField label="Min Amount">
          <Input
            type="number"
            aria-label="Minimum amount"
            placeholder="No minimum"
            value={filters.minAmount ?? ""}
            onChange={(event) => set("minAmount", parseBound(event.target.value))}
          />
        </FilterField>

        <FilterField label="Max Amount">
          <Input
            type="number"
            aria-label="Maximum amount"
            placeholder="No maximum"
            value={filters.maxAmount ?? ""}
            onChange={(event) => set("maxAmount", parseBound(event.target.value))}
          />
        </FilterField>

        <FilterField label="Comparison">
          <NativeSelect
            value={filters.comparisonMode}
            ariaLabel="Comparison"
            onChange={(value) => set("comparisonMode", value as StandardReportFilters["comparisonMode"])}
            options={COMPARISON_OPTIONS}
          />
        </FilterField>

        <FilterField label="Sort Direction">
          <NativeSelect
            value={filters.sortDirection}
            ariaLabel="Sort direction"
            onChange={(value) => set("sortDirection", value as StandardReportFilters["sortDirection"])}
            options={[
              { value: "desc", label: "Descending" },
              { value: "asc", label: "Ascending" },
            ]}
          />
        </FilterField>

        <FilterField label="Row Limit">
          <Input
            type="number"
            aria-label="Row limit"
            min={1}
            max={500}
            value={filters.limit}
            onChange={(event) => set("limit", parseBound(event.target.value) ?? 25)}
          />
        </FilterField>
      </div>
    </div>
  );
}
