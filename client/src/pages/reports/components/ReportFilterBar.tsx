import { useEffect, useMemo, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button, FilterBar, Input } from "@/components/ui";
import { DatePresetDropdown } from "../shared";
import { computeDateRange, type DatePreset } from "../dateRange";
import { activeFilterChips, clearAllFilters, clearFilter } from "../filterChips";
import type { StandardReportFilters, StandardReportOptions } from "../standardReportClient";
import { AdvancedFilterPanel } from "./AdvancedFilterPanel";
import { FilterField, NativeSelect } from "./filterControls";

interface ReportFilterBarProps {
  filters: StandardReportFilters;
  options: StandardReportOptions | undefined;
  onChange: (next: StandardReportFilters) => void;
}

const SEARCH_DEBOUNCE_MS = 300;

/**
 * The always-visible filter row plus the chip row. All filter state is owned by the
 * caller; the only local state here is the search debounce buffer and the advanced
 * panel's open flag.
 */
export function ReportFilterBar({ filters, options, onChange }: ReportFilterBarProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(filters.searchText ?? "");

  // Latest props, so the debounce effect never commits a stale filter object.
  const latest = useRef({ filters, onChange });

  latest.current = { filters, onChange };

  // Re-sync the buffer when search is changed from outside (chip removal, saved report).
  useEffect(() => {
    setSearchDraft(filters.searchText ?? "");
  }, [filters.searchText]);

  // Debounce the search box: without this every keystroke fires a report query.
  useEffect(() => {
    const next = searchDraft.trim() ? searchDraft.trim() : undefined;

    if (next === latest.current.filters.searchText) return;

    const timeout = window.setTimeout(() => {
      latest.current.onChange({ ...latest.current.filters, searchText: next });
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [searchDraft, filters.searchText]);

  const chips = useMemo(() => activeFilterChips(filters, options), [filters, options]);

  const handleDatePresetChange = (preset: DatePreset) => {
    const range = computeDateRange(preset, {
      startDate: filters.startDate,
      endDate: filters.endDate,
    });

    onChange({
      ...filters,
      datePreset: preset,
      startDate: range.startDate,
      endDate: range.endDate,
    });
  };

  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
        <FilterField label="Date Range">
          <DatePresetDropdown value={filters.datePreset ?? "custom"} onChange={handleDatePresetChange} />
        </FilterField>

        <FilterField label="Start Date">
          <Input
            type="date"
            value={filters.startDate}
            onChange={(e) => onChange({ ...filters, datePreset: "custom", startDate: e.target.value })}
          />
        </FilterField>

        <FilterField label="End Date">
          <Input
            type="date"
            value={filters.endDate}
            onChange={(e) => onChange({ ...filters, datePreset: "custom", endDate: e.target.value })}
          />
        </FilterField>

        <FilterField label="Group By">
          <NativeSelect
            value={filters.groupBy}
            ariaLabel="Group by"
            onChange={(value) => onChange({ ...filters, groupBy: value as StandardReportFilters["groupBy"] })}
            options={["day", "week", "month", "quarter", "year"].map((item) => ({
              value: item,
              label: item.charAt(0).toUpperCase() + item.slice(1),
            }))}
          />
        </FilterField>

        <FilterField label="Search">
          <Input
            type="search"
            aria-label="Search transactions"
            placeholder="Search descriptions..."
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
          />
        </FilterField>

        <div style={{ display: "flex", alignItems: "end" }}>
          <Button
            variant="secondary"
            onClick={() => setAdvancedOpen((current) => !current)}
            aria-expanded={advancedOpen}
            icon={<SlidersHorizontal size={16} />}
          >
            {chips.length > 0 ? `Filters (${chips.length})` : "Filters"}
          </Button>
        </div>
      </div>

      {advancedOpen && <AdvancedFilterPanel filters={filters} options={options} onChange={onChange} />}

      <FilterBar
        activeFilters={chips}
        onRemoveFilter={(id) => onChange(clearFilter(filters, id))}
        onClearAll={() => onChange(clearAllFilters(filters))}
      />
    </div>
  );
}
