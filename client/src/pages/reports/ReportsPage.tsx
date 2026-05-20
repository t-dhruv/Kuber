import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus } from "lucide-react";
import {
  ReportTab,
  TabBar,
  DatePresetDropdown,
} from "./shared";
import { CashFlowTab } from "./tabs/CashFlowTab";
import { SavingsTab } from "./tabs/SavingsTab";
import { SpendingTab } from "./tabs/SpendingTab";
import { BenchmarksTab } from "./tabs/BenchmarksTab";
import { computeDateRange, type DatePreset } from "./dateRange";
import { api } from "@/lib/api";
import {
  Card,
  Modal,
  ModalFooter,
  Button,
  Input,
  notify,
  ConfirmDialog,
} from "@/components/ui";
import { DrillPanel } from "./components/DrillPanel";
import { BudgetVarianceChart } from "./components/BudgetVarianceChart";
import { CashFlowForecast } from "./components/CashFlowForecast";
import { NetWorthSection } from "./components/NetWorthSection";
import { AssetsLiabilitiesSection } from "./components/AssetsLiabilitiesSection";
import { InvestmentPerformanceSection } from "./components/InvestmentPerformanceSection";
import { AllocationDriftSection } from "./components/AllocationDriftSection";
import { ContributionRoomSection } from "./components/ContributionRoomSection";
import { DividendForecastSection } from "./components/DividendForecastSection";
import { RetirementSimulationSection } from "./components/RetirementSimulationSection";
import { ExportButtons } from "./components/ExportButtons";
import { TaxSummaryTab } from "./components/TaxSummaryTab";
import { OverviewSummary } from "./components/OverviewSummary";

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>("overview");
  const [datePreset, setDatePreset] = useState<DatePreset>("thisYear");
  const [startDate, setStartDate] = useState(() => {
    const range = computeDateRange(datePreset);
    return range.startDate;
  });
  const [endDate, setEndDate] = useState(() => {
    const range = computeDateRange(datePreset);
    return range.endDate;
  });
  const [excludeCategoryIds] = useState<string[]>([]);
  const [excludeAccountIds] = useState<string[]>([]);
  const [drillPanel, setDrillPanel] = useState<{
    id: string;
    name: string;
    icon: string | null | undefined;
    mode: "spending" | "income";
    groupBy: string;
  } | null>(null);

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveModalName, setSaveModalName] = useState("");
  const [selectedSavedViewId, setSelectedSavedViewId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: (name: string) =>
      api.post("/reports/saved-views", {
        name,
        filters: {
          tab,
          datePreset,
          startDate,
          endDate,
          excludeCategoryIds,
          excludeAccountIds,
        },
      }),
    onSuccess: () => {
      setSaveModalName("");
      setShowSaveModal(false);
      queryClient.invalidateQueries({ queryKey: ["reports-saved-views"] });
      notify.success("View saved");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/reports/saved-views/${id}`),
    onSuccess: () => {
      setSelectedSavedViewId(null);
      setShowDeleteConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["reports-saved-views"] });
      notify.success("View deleted");
    },
  });

  const handleDatePresetChange = (preset: DatePreset) => {
    setDatePreset(preset);
    const range = computeDateRange(preset);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  const extraParams = [
    excludeCategoryIds.length > 0 ? `&excludeCategories=${excludeCategoryIds.join(",")}` : "",
    excludeAccountIds.length > 0 ? `&excludeAccounts=${excludeAccountIds.join(",")}` : "",
  ].join("");

  return (
    <div style={{ padding: "2rem", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "0.5rem" }}>
          Reports
        </h1>
        <p style={{ color: "var(--color-text-secondary)", marginBottom: "1.5rem" }}>
          Analyze your spending, savings, and financial performance
        </p>
      </div>

      {/* Controls */}
      <Card style={{ marginBottom: "2rem", padding: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <DatePresetDropdown value={datePreset} onChange={handleDatePresetChange} />
          <ExportButtons type="spending" from={startDate} to={endDate} />
          <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
            <Button
              onClick={() => setShowSaveModal(true)}
              variant="secondary"
              size="sm"
              icon={<BookmarkPlus size={16} />}
            >
              Save View
            </Button>
          </div>
        </div>
      </Card>

      {/* Drill Panel */}
      {drillPanel && (
        <DrillPanel
          filter={{
            groupId: drillPanel.id,
            groupName: drillPanel.name,
            groupIcon: drillPanel.icon,
            mode: drillPanel.mode,
            groupBy: drillPanel.groupBy,
            startDate,
            endDate,
          }}
          onClose={() => setDrillPanel(null)}
        />
      )}

      {/* Tab Bar */}
      <div style={{ marginBottom: "1.5rem" }}>
        <TabBar tab={tab} onChange={setTab} />
      </div>

      {/* Tabs Content */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {tab === "overview" && <OverviewSummary />}
        {tab === "cashflow" && (
          <CashFlowTab startDate={startDate} endDate={endDate} extraParams={extraParams} />
        )}
        {tab === "savings" && (
          <SavingsTab startDate={startDate} endDate={endDate} extraParams={extraParams} />
        )}
        {tab === "spending" && (
          <SpendingTab
            mode="spending"
            startDate={startDate}
            endDate={endDate}
            extraParams={extraParams}
            onDrillClick={(id, name, icon, mode, groupBy) =>
              setDrillPanel({ id, name, icon, mode, groupBy })
            }
          />
        )}
        {tab === "income" && (
          <SpendingTab
            mode="income"
            startDate={startDate}
            endDate={endDate}
            extraParams={extraParams}
            onDrillClick={(id, name, icon, mode, groupBy) =>
              setDrillPanel({ id, name, icon, mode, groupBy })
            }
          />
        )}
        {tab === "variance" && (
          <BudgetVarianceChart from={startDate} to={endDate} />
        )}
        {tab === "forecast" && (
          <CashFlowForecast />
        )}
        {tab === "tax" && (
          <TaxSummaryTab />
        )}
        {tab === "benchmarks" && (
          <BenchmarksTab startDate={startDate} endDate={endDate} />
        )}
        {tab === "networth" && (
          <NetWorthSection />
        )}
        {tab === "assetsliabilities" && (
          <AssetsLiabilitiesSection />
        )}
        {tab === "investmentperformance" && (
          <InvestmentPerformanceSection />
        )}
        {tab === "allocationdrift" && (
          <AllocationDriftSection />
        )}
        {tab === "contributionroom" && (
          <ContributionRoomSection />
        )}
        {tab === "dividendforecast" && (
          <DividendForecastSection />
        )}
        {tab === "retirementsimulation" && (
          <RetirementSimulationSection />
        )}
      </div>

      {/* Save View Modal */}
      {showSaveModal && (
        <Modal
          open={showSaveModal}
          title="Save View"
          onClose={() => {
            setShowSaveModal(false);
            setSaveModalName("");
          }}
        >
          <div style={{ marginBottom: "1rem" }}>
            <Input
              placeholder="View name (e.g., Q1 Analysis)"
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

      {/* Delete Confirm Dialog */}
      {showDeleteConfirm && selectedSavedViewId && (
        <ConfirmDialog
          open={showDeleteConfirm}
          title="Delete View"
          message="Are you sure you want to delete this saved view?"
          onConfirm={() => deleteMutation.mutate(selectedSavedViewId)}
          onClose={() => setShowDeleteConfirm(false)}
          loading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
