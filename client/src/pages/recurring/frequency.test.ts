import { describe, expect, it } from "vitest";
import { FREQUENCY_OPTIONS, frequencyLabel, normalizeFrequency } from "./frequency";

describe("recurring frequency helpers", () => {
  it("exposes every supported UI frequency option", () => {
    expect(FREQUENCY_OPTIONS.map((option) => option.value)).toEqual([
      "WEEKLY",
      "BIWEEKLY",
      "MONTHLY",
      "QUARTERLY",
      "ANNUALLY",
    ]);
  });

  it("normalizes lowercase API frequencies for edit forms", () => {
    expect(normalizeFrequency("weekly")).toBe("WEEKLY");
    expect(normalizeFrequency("biweekly")).toBe("BIWEEKLY");
    expect(normalizeFrequency("monthly")).toBe("MONTHLY");
    expect(normalizeFrequency("quarterly")).toBe("QUARTERLY");
    expect(normalizeFrequency("annual")).toBe("ANNUALLY");
    expect(normalizeFrequency("annually")).toBe("ANNUALLY");
  });

  it("trims and preserves uppercase UI frequencies", () => {
    expect(normalizeFrequency(" WEEKLY ")).toBe("WEEKLY");
    expect(normalizeFrequency("QUARTERLY")).toBe("QUARTERLY");
  });

  it("falls back to monthly when the API omits a frequency", () => {
    expect(normalizeFrequency(null)).toBe("MONTHLY");
    expect(normalizeFrequency(undefined)).toBe("MONTHLY");
    expect(frequencyLabel(null)).toBe("Monthly");
  });

  it("labels lowercase API frequencies in recurring tables", () => {
    expect(frequencyLabel("weekly")).toBe("Weekly");
    expect(frequencyLabel("biweekly")).toBe("Bi-weekly");
    expect(frequencyLabel("monthly")).toBe("Monthly");
    expect(frequencyLabel("quarterly")).toBe("Quarterly");
    expect(frequencyLabel("annual")).toBe("Annually");
  });
});
