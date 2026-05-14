import { describe, expect, it } from "vitest";
import { computeDateRange } from "./dateRange";

describe("computeDateRange", () => {
  const now = new Date("2026-05-07T12:00:00.000Z");

  it("uses explicit dates for a custom report range", () => {
    expect(
      computeDateRange(
        "custom",
        { startDate: "2026-02-10", endDate: "2026-04-20" },
        now,
      ),
    ).toEqual({ startDate: "2026-02-10", endDate: "2026-04-20" });
  });

  it("keeps preset ranges independent from custom dates", () => {
    expect(
      computeDateRange(
        "thisMonth",
        { startDate: "2026-02-10", endDate: "2026-04-20" },
        now,
      ),
    ).toEqual({ startDate: "2026-05-01", endDate: "2026-05-31" });
  });
});
