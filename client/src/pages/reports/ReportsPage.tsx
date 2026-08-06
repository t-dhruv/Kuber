import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, Download, Save, Star, Trash2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { ReportTab, TabBar, DatePresetDropdown } from "./shared";
import { CashFlowTab } from "./tabs/CashFlowTab";
import { SavingsTab } from "./tabs/SavingsTab";
import { SpendingTab } from "./tabs/SpendingTab";
import { BenchmarksTab } from "./tabs/BenchmarksTab";
import { computeDateRange, type DatePreset } from "./dateRange";
import { api } from "@/lib/api";
import { Card, Modal, ModalFooter, Button, Input, notify, ConfirmDialog } from "@/components/ui";
import { DrillPanel } from "./components/DrillPanel";
import { BudgetVarianceChart } from "./components/BudgetVarianceChart";
import { CashFlowForecast } from "./components/CashFlowForecast";
import { AssetsLiabilitiesSection } from "./components/AssetsLiabilitiesSection";
import { AllocationDriftSection } from "./components/AllocationDriftSection";
import { ContributionRoomSection } from "./components/ContributionRoomSection";
import { DividendForecastSection } from "./components/DividendForecastSection";
import { RetirementSimulationSection } from "./components/RetirementSimulationSection";
import { TaxSummaryTab } from "./components/TaxSummaryTab";
import { StandardReportPanel } from "./components/StandardReportPanel";
import {
  normalizeSavedReportFilters,
  serializeReportFilters,
  standardExportPath,
  type StandardReportFilters,
  type StandardReportOptions,
  type StandardSavedReport,
} from "./standardReportClient";

const STANDARD_TABS = new Set<ReportTab>([
  "overview",
  "cashflow",
  "category",
  "income",
  "budget",
  "tag",
  "account",
  "merchant",
  "audit",
  "networth",
  "investmentperformance",
]);

type SelectOption = {
  label: string;
  value: string;
};

function csv(value: string | null): string[] {
  return value
    ? value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
    : [];
}

function updateMulti<K extends keyof StandardReportFilters>(
  setFilters: Dispatch<SetStateAction<StandardReportFilters>>,
  key: K,
  value: StandardReportFilters[K],
) {
  setFilters((current) => ({ ...current, [key]: value }));
}

const controlStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "2.5rem",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  fontSize: "0.875rem",
};

function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
      <span
        style={{
          fontSize: "0.8125rem",
          fontWeight: 600,
          color: "var(--color-text)",
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function NativeSelect({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      value={value}
      aria-label={ariaLabel ?? placeholder}
      onChange={(event) => onChange(event.target.value)}
      style={{
        ...controlStyle,
        padding: "0 0.625rem",
      }}
    >
      {placeholder && <option value="">{placeholder}</option>}

      {options.map((option) => (
        <option
          key={option.value}
          value={option.value}
          style={{
            background: "var(--color-surface)",
            color: "var(--color-text)",
          }}
        >
          {option.label}
        </option>
      ))}
    </select>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      style={{
        ...controlStyle,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
        padding: "0 0.75rem",
        cursor: "pointer",
      }}
    >
      <span>{label}</span>

      <span
        aria-hidden="true"
        style={{
          width: "2rem",
          height: "1.125rem",
          borderRadius: "var(--radius-full)",
          border: "1px solid var(--color-border-strong)",
          background: checked ? "var(--color-accent-light)" : "var(--color-surface-alt)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: checked ? "flex-end" : "flex-start",
          padding: "0.125rem",
        }}
      >
        <span
          style={{
            width: "0.75rem",
            height: "0.75rem",
            borderRadius: "var(--radius-full)",
            background: checked ? "var(--color-accent)" : "var(--color-text-muted)",
          }}
        />
      </span>
    </button>
  );
}

function SearchableMultiSelect({
  value,
  options,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  onChange,
}: {
  value: string[];
  options: SelectOption[];
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  onChange: (value: string[]) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedValueSet = useMemo(() => new Set(value), [value]);

  const selectedOptions = useMemo(
    () => options.filter((option) => selectedValueSet.has(option.value)),
    [options, selectedValueSet],
  );

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) return options;

    return options.filter((option) => option.label.toLowerCase().includes(normalizedQuery));
  }, [options, query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;

    const timeout = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [open]);

  const toggleValue = (nextValue: string) => {
    if (selectedValueSet.has(nextValue)) {
      onChange(value.filter((item) => item !== nextValue));
      return;
    }

    onChange([...value, nextValue]);
  };

  const selectVisible = () => {
    const next = new Set(value);

    filteredOptions.forEach((option) => {
      next.add(option.value);
    });

    onChange(Array.from(next));
  };

  const clearVisible = () => {
    const visibleValues = new Set(filteredOptions.map((option) => option.value));

    onChange(value.filter((item) => !visibleValues.has(item)));
  };

  const summary =
    selectedOptions.length === 0
      ? placeholder
      : selectedOptions.length === 1
        ? selectedOptions[0].label
        : `${selectedOptions.length} selected`;

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        style={{
          width: "100%",
          minHeight: "2.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          padding: "0.375rem 0.625rem",
          border: "1px solid var(--color-border, ButtonBorder)",
          borderRadius: "0.5rem",
          background: "var(--color-surface, ButtonFace)",
          color: "var(--color-text, ButtonText)",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: "0.875rem",
          }}
        >
          {summary}
        </span>

        <span aria-hidden="true">▾</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            zIndex: 30,
            top: "calc(100% + 0.375rem)",
            left: 0,
            right: 0,
            border: "1px solid var(--color-border, ButtonBorder)",
            borderRadius: "0.75rem",
            background: "var(--color-surface, Canvas)",
            boxShadow: "var(--shadow-lg, 0 12px 30px rgba(0, 0, 0, 0.14))",
            padding: "0.5rem",
          }}
        >
          <Input
            ref={searchInputRef}
            value={query}
            placeholder={searchPlaceholder}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setOpen(false);
              }
            }}
          />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "0.5rem",
              marginTop: "0.5rem",
              marginBottom: "0.5rem",
            }}
          >
            <Button size="sm" variant="ghost" onClick={selectVisible}>
              Select visible
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={clearVisible}
              disabled={value.length === 0}
            >
              Clear visible
            </Button>
          </div>

          <div
            role="listbox"
            aria-multiselectable="true"
            style={{
              maxHeight: "16rem",
              overflowY: "auto",
              display: "grid",
              gap: "0.25rem",
            }}
          >
            {filteredOptions.length === 0 && (
              <div
                style={{
                  padding: "0.75rem",
                  fontSize: "0.875rem",
                  color: "var(--color-text-secondary)",
                }}
              >
                {emptyMessage}
              </div>
            )}

            {filteredOptions.map((option) => {
              const selected = selectedValueSet.has(option.value);

              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => toggleValue(option.value)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    width: "100%",
                    padding: "0.5rem 0.625rem",
                    border: 0,
                    borderRadius: "0.5rem",
                    background: selected ? "var(--color-surface-muted, ButtonFace)" : "transparent",
                    color: "var(--color-text, ButtonText)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: "0.875rem",
                  }}
                >
                  <span>{option.label}</span>
                  {selected && <span aria-hidden="true">✓</span>}
                </button>
              );
            })}
          </div>

          {selectedOptions.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.375rem",
                marginTop: "0.5rem",
                paddingTop: "0.5rem",
                borderTop: "1px solid var(--color-border, ButtonBorder)",
              }}
            >
              {selectedOptions.slice(0, 4).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleValue(option.value)}
                  title={`Remove ${option.label}`}
                  style={{
                    border: "1px solid var(--color-border, ButtonBorder)",
                    borderRadius: "999px",
                    background: "transparent",
                    color: "var(--color-text, ButtonText)",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    padding: "0.25rem 0.5rem",
                  }}
                >
                  {option.label} ×
                </button>
              ))}

              {selectedOptions.length > 4 && (
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-text-secondary)",
                    padding: "0.25rem 0",
                  }}
                >
                  +{selectedOptions.length - 4} more
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPreset = (searchParams.get("datePreset") as DatePreset | null) ?? "thisYear";
  const initialRange = computeDateRange(initialPreset);

  const [filters, setFilters] = useState<StandardReportFilters>(() => ({
    tab: (searchParams.get("tab") as ReportTab | null) ?? "overview",
    datePreset: initialPreset,
    startDate: searchParams.get("startDate") ?? initialRange.startDate,
    endDate: searchParams.get("endDate") ?? initialRange.endDate,
    groupBy: (searchParams.get("groupBy") as StandardReportFilters["groupBy"] | null) ?? "month",
    accountIds: csv(searchParams.get("accountIds")),
    categoryIds: csv(searchParams.get("categoryIds")),
    budgetIds: csv(searchParams.get("budgetIds")),
    tagIds: csv(searchParams.get("tagIds")),
    merchantIds: csv(searchParams.get("merchantIds")),
    includePending: searchParams.get("includePending") === "true",
    includeTransfers: searchParams.get("includeTransfers") === "true",
    currencyCode: searchParams.get("currencyCode") ?? undefined,
  }));

  const [drillPanel, setDrillPanel] = useState<{
    id: string;
    name: string;
    icon: string | null | undefined;
    mode: "spending" | "income";
    groupBy: string;
  } | null>(null);

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveModalName, setSaveModalName] = useState("");
  const [selectedSavedViewId, setSelectedSavedViewId] = useState<string>("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const queryClient = useQueryClient();

  const optionsQuery = useQuery<StandardReportOptions>({
    queryKey: ["reports", "standard-options"],
    queryFn: () => api.get("/reports/standard/options").then((r) => r.data),
  });

  const savedViewsQuery = useQuery<StandardSavedReport[]>({
    queryKey: ["reports-saved-views"],
    queryFn: () => api.get("/reports/saved-views").then((r) => r.data),
  });

  const selectedSavedView = savedViewsQuery.data?.find((view) => view.id === selectedSavedViewId);
  const selectedSavedMeta = selectedSavedView ? normalizeSavedReportFilters(selectedSavedView.filters) : undefined;
  const isFavorite = Boolean(selectedSavedMeta?.isFavorite);
  const isStandardTab = STANDARD_TABS.has(filters.tab as ReportTab);

  useEffect(() => {
    const next = new URLSearchParams();

    next.set("tab", filters.tab);

    if (filters.datePreset) next.set("datePreset", filters.datePreset);

    next.set("startDate", filters.startDate);
    next.set("endDate", filters.endDate);
    next.set("groupBy", filters.groupBy);

    if (filters.accountIds.length) next.set("accountIds", filters.accountIds.join(","));
    if (filters.categoryIds.length) next.set("categoryIds", filters.categoryIds.join(","));
    if (filters.budgetIds.length) next.set("budgetIds", filters.budgetIds.join(","));
    if (filters.tagIds.length) next.set("tagIds", filters.tagIds.join(","));
    if (filters.merchantIds.length) next.set("merchantIds", filters.merchantIds.join(","));
    if (filters.includePending) next.set("includePending", "true");
    if (filters.includeTransfers) next.set("includeTransfers", "true");
    if (filters.currencyCode) next.set("currencyCode", filters.currencyCode);

    setSearchParams(next, { replace: true });
  }, [filters, setSearchParams]);

  const saveMutation = useMutation({
    mutationFn: (name: string) =>
      api.post("/reports/saved-views", {
        name,
        filters: serializeReportFilters(filters),
      }),
    onSuccess: () => {
      setSaveModalName("");
      setShowSaveModal(false);
      queryClient.invalidateQueries({ queryKey: ["reports-saved-views"] });
      notify.success("Report saved");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name, favorite }: { id: string; name: string; favorite: boolean }) =>
      api.put(`/reports/saved-views/${id}`, {
        name,
        filters: serializeReportFilters(filters, favorite),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports-saved-views"] });
      notify.success("Saved report updated");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/reports/saved-views/${id}`),
    onSuccess: () => {
      setSelectedSavedViewId("");
      setShowDeleteConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["reports-saved-views"] });
      notify.success("Saved report deleted");
    },
  });

  const exportMutation = useMutation({
    mutationFn: async (format: "csv" | "json") => {
      const tableKey = format === "csv" ? undefined : undefined;
      const url = standardExportPath(format, filters, tableKey);
      const res = await api.get<Blob>(url, { responseType: "blob" });
      const blob = res.data;
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = objectUrl;
      a.download = `kuber-${filters.tab}-report.${format}`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    },
  });

  const currencies = useMemo(() => {
    const values = new Set(
      (optionsQuery.data?.accounts ?? [])
        .map((account) => account.currency)
        .filter(Boolean),
    );

    return Array.from(values).sort();
  }, [optionsQuery.data?.accounts]);

  const handleDatePresetChange = (preset: DatePreset) => {
    const range = computeDateRange(preset, {
      startDate: filters.startDate,
      endDate: filters.endDate,
    });

    setFilters((current) => ({
      ...current,
      datePreset: preset,
      startDate: range.startDate,
      endDate: range.endDate,
    }));
  };

  const applySavedView = (id: string) => {
    setSelectedSavedViewId(id);

    const saved = savedViewsQuery.data?.find((view) => view.id === id);

    if (!saved) return;

    const normalized = normalizeSavedReportFilters(saved.filters);

    setFilters((current) => ({
      ...current,
      ...normalized,
      tab: (normalized.tab as ReportTab | undefined) ?? current.tab,
    }));
  };

  const extraParams = [
    filters.categoryIds.length > 0 ? `&categoryIds=${filters.categoryIds.join(",")}` : "",
    filters.accountIds.length > 0 ? `&accountIds=${filters.accountIds.join(",")}` : "",
  ].join("");

  return (
    <div style={{ padding: "2rem", maxWidth: "1400px", margin: "0 auto" }}>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "0.5rem" }}>Reports</h1>
        <p style={{ color: "var(--color-text-secondary)", marginBottom: "1.5rem" }}>
          Analyze household-scoped financial activity with saved, exportable reports.
        </p>
      </div>

      <Card style={{ marginBottom: "1.5rem", padding: "1rem" }}>
        <div className="grid gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
            <FilterField label="Date Range">
              <DatePresetDropdown
                value={filters.datePreset ?? "custom"}
                onChange={handleDatePresetChange}
              />
            </FilterField>

            <FilterField label="Start Date">
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) =>
                  setFilters((current) => ({
                    ...current,
                    datePreset: "custom",
                    startDate: e.target.value,
                  }))
                }
              />
            </FilterField>

            <FilterField label="End Date">
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) =>
                  setFilters((current) => ({
                    ...current,
                    datePreset: "custom",
                    endDate: e.target.value,
                  }))
                }
              />
            </FilterField>

            <FilterField label="Group By">
              <NativeSelect
                value={filters.groupBy}
                ariaLabel="Group by"
                onChange={(value) =>
                  updateMulti(
                    setFilters,
                    "groupBy",
                    value as StandardReportFilters["groupBy"],
                  )
                }
                options={["day", "week", "month", "quarter", "year"].map((item) => ({
                  value: item,
                  label: item.charAt(0).toUpperCase() + item.slice(1),
                }))}
              />
            </FilterField>

            <FilterField label="Currency">
              <NativeSelect
                value={filters.currencyCode ?? ""}
                placeholder="All currencies"
                ariaLabel="Currency"
                onChange={(value) =>
                  updateMulti(setFilters, "currencyCode", value || undefined)
                }
                options={currencies.map((currency) => ({
                  value: currency,
                  label: currency,
                }))}
              />
            </FilterField>

            <div style={{ display: "flex", alignItems: "end" }}>
              <ToggleField
                label="Pending"
                checked={filters.includePending}
                onChange={(checked) =>
                  updateMulti(setFilters, "includePending", checked)
                }
              />
            </div>

            <div style={{ display: "flex", alignItems: "end" }}>
              <ToggleField
                label="Transfers"
                checked={filters.includeTransfers}
                onChange={(checked) =>
                  updateMulti(setFilters, "includeTransfers", checked)
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            <FilterField label="Accounts">
              <SearchableMultiSelect
                value={filters.accountIds}
                options={(optionsQuery.data?.accounts ?? []).map((account) => ({
                  label: account.name,
                  value: account.id,
                }))}
                placeholder="All accounts"
                searchPlaceholder="Search accounts..."
                emptyMessage="No accounts found"
                onChange={(value) => updateMulti(setFilters, "accountIds", value)}
              />
            </FilterField>

            <FilterField label="Categories">
              <SearchableMultiSelect
                value={filters.categoryIds}
                options={(optionsQuery.data?.categories ?? []).map((category) => ({
                  label: category.name,
                  value: category.id,
                }))}
                placeholder="All categories"
                searchPlaceholder="Search categories..."
                emptyMessage="No categories found"
                onChange={(value) => updateMulti(setFilters, "categoryIds", value)}
              />
            </FilterField>

            <FilterField label="Budgets">
              <SearchableMultiSelect
                value={filters.budgetIds}
                options={(optionsQuery.data?.budgets ?? []).map((budget) => ({
                  label: budget.name,
                  value: budget.id,
                }))}
                placeholder="All budgets"
                searchPlaceholder="Search budgets..."
                emptyMessage="No budgets found"
                onChange={(value) => updateMulti(setFilters, "budgetIds", value)}
              />
            </FilterField>

            <FilterField label="Tags">
              <SearchableMultiSelect
                value={filters.tagIds}
                options={(optionsQuery.data?.tags ?? []).map((tag) => ({
                  label: tag.name,
                  value: tag.id,
                }))}
                placeholder="All tags"
                searchPlaceholder="Search tags..."
                emptyMessage="No tags found"
                onChange={(value) => updateMulti(setFilters, "tagIds", value)}
              />
            </FilterField>

            <FilterField label="Merchants">
              <SearchableMultiSelect
                value={filters.merchantIds}
                options={(optionsQuery.data?.merchants ?? []).map((merchant) => ({
                  label: merchant.name,
                  value: merchant.id,
                }))}
                placeholder="All merchants"
                searchPlaceholder="Search merchants..."
                emptyMessage="No merchants found"
                onChange={(value) => updateMulti(setFilters, "merchantIds", value)}
              />
            </FilterField>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "end",
              justifyContent: "space-between",
              gap: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "end",
                gap: "0.5rem",
                flexWrap: "wrap",
              }}
            >
              <FilterField label="Saved Report">
                <NativeSelect
                  value={selectedSavedViewId}
                  placeholder="Saved reports"
                  ariaLabel="Saved reports"
                  onChange={applySavedView}
                  options={(savedViewsQuery.data ?? []).map((view) => {
                    const meta = normalizeSavedReportFilters(view.filters);

                    return {
                      value: view.id,
                      label: `${meta.isFavorite ? "★ " : ""}${view.name}`,
                    };
                  })}
                />
              </FilterField>

              <Button
                onClick={() => setShowSaveModal(true)}
                variant="secondary"
                size="sm"
                icon={<BookmarkPlus size={16} />}
              >
                Save
              </Button>

              <Button
                onClick={() =>
                  selectedSavedView &&
                  updateMutation.mutate({
                    id: selectedSavedView.id,
                    name: selectedSavedView.name,
                    favorite: isFavorite,
                  })
                }
                disabled={!selectedSavedView || updateMutation.isPending}
                variant="secondary"
                size="sm"
                icon={<Save size={16} />}
              >
                Update
              </Button>

              <Button
                onClick={() =>
                  selectedSavedView &&
                  updateMutation.mutate({
                    id: selectedSavedView.id,
                    name: selectedSavedView.name,
                    favorite: !isFavorite,
                  })
                }
                disabled={!selectedSavedView || updateMutation.isPending}
                variant={isFavorite ? "primary" : "secondary"}
                size="sm"
                icon={<Star size={16} />}
              >
                {isFavorite ? "Favorited" : "Favorite"}
              </Button>

              <Button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={!selectedSavedView}
                variant="ghost"
                size="sm"
                icon={<Trash2 size={16} />}
              >
                Delete
              </Button>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <Button
                onClick={() => exportMutation.mutate("csv")}
                disabled={!isStandardTab || exportMutation.isPending}
                variant="secondary"
                size="sm"
                icon={<Download size={16} />}
              >
                Export CSV
              </Button>

              <Button
                onClick={() => exportMutation.mutate("json")}
                disabled={!isStandardTab || exportMutation.isPending}
                variant="secondary"
                size="sm"
                icon={<Download size={16} />}
              >
                Export JSON
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {drillPanel && (
        <DrillPanel
          filter={{
            groupId: drillPanel.id,
            groupName: drillPanel.name,
            groupIcon: drillPanel.icon,
            mode: drillPanel.mode,
            groupBy: drillPanel.groupBy,
            startDate: filters.startDate,
            endDate: filters.endDate,
          }}
          onClose={() => setDrillPanel(null)}
        />
      )}

      <div style={{ marginBottom: "1.5rem" }}>
        <TabBar
          tab={filters.tab as ReportTab}
          onChange={(tab) => setFilters((current) => ({ ...current, tab }))}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {isStandardTab && <StandardReportPanel filters={filters} />}

        {!isStandardTab && filters.tab === "savings" && (
          <SavingsTab
            startDate={filters.startDate}
            endDate={filters.endDate}
            extraParams={extraParams}
          />
        )}

        {!isStandardTab && filters.tab === "spending" && (
          <SpendingTab
            mode="spending"
            startDate={filters.startDate}
            endDate={filters.endDate}
            extraParams={extraParams}
            onDrillClick={(id, name, icon, mode, groupBy) =>
              setDrillPanel({ id, name, icon, mode, groupBy })
            }
          />
        )}

        {!isStandardTab && filters.tab === "variance" && (
          <BudgetVarianceChart from={filters.startDate} to={filters.endDate} />
        )}

        {!isStandardTab && filters.tab === "forecast" && <CashFlowForecast />}

        {!isStandardTab && filters.tab === "tax" && <TaxSummaryTab />}

        {!isStandardTab && filters.tab === "benchmarks" && (
          <BenchmarksTab startDate={filters.startDate} endDate={filters.endDate} />
        )}

        {!isStandardTab && filters.tab === "assetsliabilities" && <AssetsLiabilitiesSection />}

        {!isStandardTab && filters.tab === "allocationdrift" && <AllocationDriftSection />}

        {!isStandardTab && filters.tab === "contributionroom" && <ContributionRoomSection />}

        {!isStandardTab && filters.tab === "dividendforecast" && <DividendForecastSection />}

        {!isStandardTab && filters.tab === "retirementsimulation" && <RetirementSimulationSection />}

        {!isStandardTab && filters.tab === "cashflow" && (
          <CashFlowTab
            startDate={filters.startDate}
            endDate={filters.endDate}
            extraParams={extraParams}
          />
        )}
      </div>

      {showSaveModal && (
        <Modal
          open={showSaveModal}
          title="Save Report"
          onClose={() => {
            setShowSaveModal(false);
            setSaveModalName("");
          }}
        >
          <div style={{ marginBottom: "1rem" }}>
            <Input
              placeholder="Report name"
              value={saveModalName}
              onChange={(e) => setSaveModalName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && saveModalName.trim()) {
                  saveMutation.mutate(saveModalName);
                }
              }}
            />
          </div>

          <ModalFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setShowSaveModal(false);
                setSaveModalName("");
              }}
            >
              Cancel
            </Button>

            <Button
              onClick={() => saveMutation.mutate(saveModalName)}
              disabled={!saveModalName.trim() || saveMutation.isPending}
            >
              Save
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {showDeleteConfirm && selectedSavedViewId && (
        <ConfirmDialog
          open={showDeleteConfirm}
          title="Delete Report"
          message="Delete this saved report?"
          onConfirm={() => deleteMutation.mutate(selectedSavedViewId)}
          onClose={() => setShowDeleteConfirm(false)}
          loading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}