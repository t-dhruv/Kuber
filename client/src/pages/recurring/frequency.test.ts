import { describe, expect, it } from "vitest";
import { frequencyLabel, normalizeFrequency } from "./frequency";

describe("recurring frequency helpers", () => {
  it("normalizes lowercase API frequencies for edit forms", () => {
    expect(normalizeFrequency("monthly")).toBe("MONTHLY");
    expect(normalizeFrequency("annual")).toBe("ANNUALLY");
  });

  it("labels lowercase API frequencies in recurring tables", () => {
    expect(frequencyLabel("biweekly")).toBe("Bi-weekly");
  });
});
