import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NetWorthSection } from "../../../../src/pages/reports/components/NetWorthSection";

describe("NetWorthSection", () => {
  it("shows liquid and total net worth with history when present", () => {
    const html = renderToStaticMarkup(
      <NetWorthSection
        data={{
          current: {
            assets: 180000,
            liabilities: 55000,
            netWorth: 125000,
            liquidNetWorth: 92000,
          },
          history: [
            { date: "2026-01-01", assets: 170000, liabilities: 60000, netWorth: 110000, liquidNetWorth: 80000 },
            { date: "2026-04-01", assets: 180000, liabilities: 55000, netWorth: 125000, liquidNetWorth: 92000 },
          ],
          change: { amount: 15000, percent: 13.6363636364, since: "2026-01-01" },
        }}
      />,
    );

    expect(html).toContain("Liquid Net Worth");
    expect(html).toContain("Total Net Worth");
    expect(html).toContain("$92,000");
    expect(html).toContain("$125,000");
    expect(html).toContain("Change History");
    expect(html).toContain("2026-01-01");
    expect(html).toContain("+$15,000");
  });
});
