import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSeedUserData } from "../../prisma/seed";
import { DEFAULT_CATEGORY_GROUPS, seedDefaultCategories } from "../../src/lib/default-categories";

describe("seed data", () => {
  it("creates the demo user as already email verified", () => {
    const data = createSeedUserData("hashed-password");

    expect(data.email).toBe("demo@kuber.app");
    expect(data.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it("defines type on every default category instead of category groups", () => {
    expect(DEFAULT_CATEGORY_GROUPS.length).toBeGreaterThan(0);

    for (const group of DEFAULT_CATEGORY_GROUPS) {
      expect(group).not.toHaveProperty("type");
      expect(group.categories.length).toBeGreaterThan(0);
      for (const category of group.categories) {
        expect(["income", "expense", "transfer"]).toContain(category.type);
      }
    }
  });

  it("classifies report-sensitive default categories by transaction semantics", () => {
    const categories = new Map(
      DEFAULT_CATEGORY_GROUPS.flatMap((group) => group.categories.map((category) => [category.name, category])),
    );

    for (const name of [
      "Emergency Fund",
      "RRSP Contribution",
      "TFSA Contribution",
      "RESP Contribution",
      "General Investments",
      "Mortgage Principal Payment",
      "Loan/Debt Repayment",
      "Credit Card Payment",
      "Cash Deposit",
      "Internal Transfer",
      "Balance Adjustment",
    ]) {
      expect(categories.get(name)?.type, name).toBe("transfer");
    }

    for (const name of [
      "ABM Cash",
      "Bank Fees & Interest",
      "Mortgage Interest",
      "Student Loan Interest",
      "Interac e-Transfer Sent",
    ]) {
      expect(categories.get(name)?.type, name).toBe("expense");
    }

    expect(categories.get("Interac e-Transfer Received")?.type).toBe("income");
  });

  it("keeps canonical defaults compatible with literal demo seed category references", () => {
    const seedSource = readFileSync(resolve(__dirname, "../../prisma/seed.ts"), "utf8");
    const referencedNames = Array.from(seedSource.matchAll(/catId\("([^"]+)"\)/g), (match) => match[1]);
    const categoryNames = new Set(
      DEFAULT_CATEGORY_GROUPS.flatMap((group) => group.categories.map((category) => category.name)),
    );

    expect(referencedNames.length).toBeGreaterThan(0);
    for (const name of referencedNames) {
      expect(categoryNames.has(name), name).toBe(true);
    }
  });

  it("seeds untyped groups and category-level types", async () => {
    const groupCreate = vi.fn(async () => ({ id: "group-1" }));
    const categoryCreate = vi.fn(async () => ({ id: "category-1" }));

    await seedDefaultCategories(
      {
        categoryGroup: { create: groupCreate },
        category: { create: categoryCreate },
      },
      "household-1",
    );

    expect(groupCreate).toHaveBeenCalledWith({
      data: expect.not.objectContaining({ type: expect.anything() }),
    });
    expect(categoryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: expect.stringMatching(/^(income|expense|transfer)$/) }),
    });
  });
});
