import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type React from "react";
import { AssetsLiabilitiesSection } from "../../../../src/pages/reports/components/AssetsLiabilitiesSection";
import { InvestmentPerformanceSection } from "../../../../src/pages/reports/components/InvestmentPerformanceSection";
import { AllocationDriftSection } from "../../../../src/pages/reports/components/AllocationDriftSection";
import { ContributionRoomSection } from "../../../../src/pages/reports/components/ContributionRoomSection";
import { DividendForecastSection } from "../../../../src/pages/reports/components/DividendForecastSection";
import { RetirementSimulationSection } from "../../../../src/pages/reports/components/RetirementSimulationSection";

function renderWithClient(element: React.ReactElement, seed?: (client: QueryClient) => void) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  seed?.(client);

  return renderToStaticMarkup(
    <QueryClientProvider client={client}>{element}</QueryClientProvider>,
  );
}

describe("wealth and advanced report sections", () => {
  it("renders the assets and liabilities section", () => {
    const html = renderWithClient(
      <AssetsLiabilitiesSection
        data={{
          bankAccountsTotal: 24000,
          investmentsTotal: 184000,
          manualAssetsTotal: 42000,
          manualLiabilitiesTotal: 0,
          mortgageTotal: 150000,
          creditCardTotal: 3200,
          otherLiabilitiesTotal: 0,
        }}
      />,
    );
    expect(html).toContain("Assets / Liabilities");
    expect(html).toContain("Total Assets");
    expect(html).toContain("Total Liabilities");
    expect(html).toContain("Net Position");
  });

  it("renders the investment performance section", () => {
    const html = renderWithClient(
      <InvestmentPerformanceSection
        data={{ portfolioValue: 314800, twr: 11.8, mwr: 9.4, trailingIncome: 6240 }}
      />,
    );
    expect(html).toContain("Investment Performance");
    expect(html).toContain("Time-weighted return");
    expect(html).toContain("Money-weighted return");
  });

  it("renders the allocation and drift section", () => {
    const html = renderWithClient(<AllocationDriftSection />, (client) => {
      client.setQueryData(["reports", "investments", "allocation"], {
        totalValue: 100000,
        byAssetClass: [
          { assetClass: "US Stocks", value: 62000, percent: 62 },
          { assetClass: "Bonds", value: 22000, percent: 22 },
        ],
        holdings: [
          { ticker: "AGG", name: "Aggressive ETFs", value: 62000, percent: 62, type: "US Stocks" },
        ],
      });
    });
    expect(html).toContain("Allocation &amp; Drift");
    expect(html).toContain("US Stocks");
    expect(html).toContain("Bonds");
    expect(html).toContain("vs target");
  });

  it("renders the contribution room section", () => {
    const html = renderWithClient(
      <ContributionRoomSection
        data={{
          accounts: [
            { id: "1", name: "TFSA", type: "TFSA", roomRemaining: 1800, overContribution: 0, pctUsed: 74, alert: "ok", contributionsYtd: 5200 },
          ],
        }}
      />,
    );
    expect(html).toContain("Contribution Room");
    expect(html).toContain("TFSA");
    expect(html).toContain("Remaining");
  });

  it("renders the dividend forecast section", () => {
    const html = renderWithClient(<DividendForecastSection />, (client) => {
      client.setQueryData(["reports", "investments", "dividend-forecast"], {
        forecast: [{ year: 2027, income: 3200 }],
        basedOn: "Projected from current holdings",
      });
    });
    expect(html).toContain("Dividend Forecast");
    expect(html).toContain("2027");
    expect(html).toContain("Projected from current holdings");
  });

  it("renders the retirement simulation section", () => {
    const html = renderWithClient(<RetirementSimulationSection />, (client) => {
      client.setQueryData(["reports", "investments", "retirement-simulation"], {
        scenarios: [{ label: "Base case", success: 82, endingBalance: 945000 }],
        portfolioValue: 314800,
        note: "Projection uses current savings rate",
      });
    });
    expect(html).toContain("Retirement Simulation");
    expect(html).toContain("Success probability");
    expect(html).toContain("Base case");
  });
});
