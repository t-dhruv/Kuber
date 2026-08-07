import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, Download, Save, Star, Trash2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { ReportTab, TabBar } from "./shared";
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
import { ReportFilterBar } from "./components/ReportFilterBar";
import { FilterField, NativeSelect } from "./components/filterControls";
import {
  DEFAULT_STANDARD_FILTERS,
  normalizeSavedReportFilters,
  serializeReportFilters,
  standardExportPath,
  type StandardReportFilters,
  type StandardReportOptions,
  type StandardSavedReport,
} from "./standardReportClient";

type MutationError = { response?: { data?: { error?: string } } };

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

function csv(value: string | null): string[] {
  return value
    ? value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
    : [];
}

function boolParam(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;

  return value === "true";
}

function numberParam(value: string | null): number | undefined {
  if (value === null || !value.trim()) return undefined;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function enumParam<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

const COMPARISON_MODES = ["none", "previous_period", "previous_year"] as const;
const RECONCILED_STATES = ["any", "reconciled", "unreconciled"] as const;
const SORT_DIRECTIONS = ["asc", "desc"] as const;

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
    categoryGroupIds: csv(searchParams.get("categoryGroupIds")),
    transactionTypes: csv(searchParams.get("transactionTypes")),
    includeHidden: boolParam(searchParams.get("includeHidden"), DEFAULT_STANDARD_FILTERS.includeHidden),
    includeSplits: boolParam(searchParams.get("includeSplits"), DEFAULT_STANDARD_FILTERS.includeSplits),
    includeExcludedFromReports: boolParam(
      searchParams.get("includeExcludedFromReports"),
      DEFAULT_STANDARD_FILTERS.includeExcludedFromReports,
    ),
    comparisonMode: enumParam(
      searchParams.get("comparisonMode"),
      COMPARISON_MODES,
      DEFAULT_STANDARD_FILTERS.comparisonMode,
    ),
    sortBy: searchParams.get("sortBy") ?? undefined,
    sortDirection: enumParam(
      searchParams.get("sortDirection"),
      SORT_DIRECTIONS,
      DEFAULT_STANDARD_FILTERS.sortDirection,
    ),
    limit: numberParam(searchParams.get("limit")) ?? DEFAULT_STANDARD_FILTERS.limit,
    minAmount: numberParam(searchParams.get("minAmount")),
    maxAmount: numberParam(searchParams.get("maxAmount")),
    searchText: searchParams.get("searchText") ?? undefined,
    onlyUncategorized: boolParam(
      searchParams.get("onlyUncategorized"),
      DEFAULT_STANDARD_FILTERS.onlyUncategorized,
    ),
    reconciledState: enumParam(
      searchParams.get("reconciledState"),
      RECONCILED_STATES,
      DEFAULT_STANDARD_FILTERS.reconciledState,
    ),
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
    if (filters.categoryGroupIds.length) next.set("categoryGroupIds", filters.categoryGroupIds.join(","));
    if (filters.transactionTypes.length) next.set("transactionTypes", filters.transactionTypes.join(","));
    if (filters.includePending) next.set("includePending", "true");
    if (filters.includeTransfers) next.set("includeTransfers", "true");
    if (filters.currencyCode) next.set("currencyCode", filters.currencyCode);

    // Only non-default values reach the URL, so a plain /reports link stays short.
    if (filters.includeHidden !== DEFAULT_STANDARD_FILTERS.includeHidden) {
      next.set("includeHidden", String(filters.includeHidden));
    }

    if (filters.includeSplits !== DEFAULT_STANDARD_FILTERS.includeSplits) {
      next.set("includeSplits", String(filters.includeSplits));
    }

    if (filters.includeExcludedFromReports !== DEFAULT_STANDARD_FILTERS.includeExcludedFromReports) {
      next.set("includeExcludedFromReports", String(filters.includeExcludedFromReports));
    }

    if (filters.onlyUncategorized !== DEFAULT_STANDARD_FILTERS.onlyUncategorized) {
      next.set("onlyUncategorized", String(filters.onlyUncategorized));
    }

    if (filters.comparisonMode !== DEFAULT_STANDARD_FILTERS.comparisonMode) {
      next.set("comparisonMode", filters.comparisonMode);
    }

    if (filters.reconciledState !== DEFAULT_STANDARD_FILTERS.reconciledState) {
      next.set("reconciledState", filters.reconciledState);
    }

    if (filters.sortDirection !== DEFAULT_STANDARD_FILTERS.sortDirection) {
      next.set("sortDirection", filters.sortDirection);
    }

    if (filters.limit !== DEFAULT_STANDARD_FILTERS.limit) next.set("limit", String(filters.limit));
    if (filters.sortBy) next.set("sortBy", filters.sortBy);
    if (filters.minAmount !== undefined) next.set("minAmount", String(filters.minAmount));
    if (filters.maxAmount !== undefined) next.set("maxAmount", String(filters.maxAmount));
    if (filters.searchText) next.set("searchText", filters.searchText);

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
    onError: (err: MutationError) =>
      notify.error("Could not save report", err.response?.data?.error),
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
    onError: (err: MutationError) =>
      notify.error("Could not update saved report", err.response?.data?.error),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/reports/saved-views/${id}`),
    onSuccess: () => {
      setSelectedSavedViewId("");
      setShowDeleteConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["reports-saved-views"] });
      notify.success("Saved report deleted");
    },
    onError: (err: MutationError) =>
      notify.error("Could not delete saved report", err.response?.data?.error),
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
          <ReportFilterBar filters={filters} options={optionsQuery.data} onChange={setFilters} />

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