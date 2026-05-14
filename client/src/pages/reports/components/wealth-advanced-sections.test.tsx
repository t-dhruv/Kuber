import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AssetsLiabilitiesSection } from "./AssetsLiabilitiesSection";
import { InvestmentPerformanceSection } from "./InvestmentPerformanceSection";
import { AllocationDriftSection } from "./AllocationDriftSection";
import { ContributionRoomSection } from "./ContributionRoomSection";
import { DividendForecastSection } from "./DividendForecastSection";
import { RetirementSimulationSection } from "./RetirementSimulationSection";

describe("wealth and advanced report sections", () => {
  it("renders the assets and liabilities section", () => {
    const html = renderToStaticMarkup(<AssetsLiabilitiesSection />);
    expect(html).toContain("Assets / Liabilities");
    expect(html).toContain("Total Assets");
    expect(html).toContain("Total Liabilities");
    expect(html).toContain("Net Position");
  });

  it("renders the investment performance section", () => {
    const html = renderToStaticMarkup(
      <InvestmentPerformanceSection
        data={{ portfolioValue: 314800, twr: 11.8, mwr: 9.4, trailingIncome: 6240 }}
      />,
    );
    expect(html).toContain("Investment Performance");
    expect(html).toContain("Time-weighted return");
    expect(html).toContain("Money-weighted return");
  });

  it("renders the allocation and drift section", () => {
    const html = renderToStaticMarkup(<AllocationDriftSection />);
    expect(html).toContain("Allocation &amp; Drift");
    expect(html).toContain("Allocation drift overview");
    expect(html).toContain("Aggressive ETFs");
    expect(html).toContain("vs target");
  });

  it("renders the contribution room section", () => {
    const html = renderToStaticMarkup(
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
    const html = renderToStaticMarkup(<DividendForecastSection />);
    expect(html).toContain("Dividend Forecast");
    expect(html).toContain("Placeholder projection");
  });

  it("renders the retirement simulation section", () => {
    const html = renderToStaticMarkup(<RetirementSimulationSection />);
    expect(html).toContain("Retirement Simulation");
    expect(html).toContain("Success probability");
  });
});
