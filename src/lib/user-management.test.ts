import { describe, expect, it } from "vitest";
import { wouldRemoveLastActiveAdmin } from "./user-management";

describe("ochrana posledního administrátora", () => {
  it("zabrání odebrání poslední aktivní ADMIN role", () =>
    expect(
      wouldRemoveLastActiveAdmin({
        targetIsActiveAdmin: true,
        nextActive: true,
        nextRoleCodes: ["TS_ADMIN"],
        otherActiveAdminCount: 0,
      }),
    ).toBe(true));
  it("dovolí změnu, pokud zůstává jiný aktivní ADMIN", () =>
    expect(
      wouldRemoveLastActiveAdmin({
        targetIsActiveAdmin: true,
        nextActive: false,
        nextRoleCodes: ["ADMIN"],
        otherActiveAdminCount: 1,
      }),
    ).toBe(false));
});
