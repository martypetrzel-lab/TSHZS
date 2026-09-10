import { describe, expect, it } from "vitest";
import { canEditEquipment } from "./permissions";
describe("oprávnění editace prostředků", () => {
  it.each(["ADMIN", "TS_ADMIN", "TECHNICIAN"])("povolí roli %s", (role) =>
    expect(canEditEquipment([role])).toBe(true),
  );
  it("zakáže běžnému uživateli editaci", () =>
    expect(canEditEquipment(["USER"])).toBe(false));
});
