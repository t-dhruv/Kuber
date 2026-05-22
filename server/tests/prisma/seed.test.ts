import { describe, expect, it } from "vitest";
import { createSeedUserData } from "../../prisma/seed";

describe("seed data", () => {
  it("creates the demo user as already email verified", () => {
    const data = createSeedUserData("hashed-password");

    expect(data.email).toBe("demo@kuber.app");
    expect(data.emailVerifiedAt).toBeInstanceOf(Date);
  });
});
