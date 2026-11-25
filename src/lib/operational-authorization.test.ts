import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), grant: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/prisma", () => ({
  prisma: { permission: { findFirst: mocks.grant } },
}));
import {
  operationalPageAccess,
  requireOperationalPermission,
} from "./operational-authorization";

describe("provozní přístup na stránku a k akcím", () => {
  const user = { id: "admin", roles: [{ role: { code: "ADMIN" } }] };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue(user);
    mocks.grant.mockResolvedValue(null);
  });
  it("vrátí očekávané zamítnutí stránky i pro ADMIN bez výslovného oprávnění", async () => {
    await expect(operationalPageAccess("protocol:create")).resolves.toEqual({
      user,
      allowed: false,
    });
  });
  it("serverová akce bez oprávnění zůstane zakázaná", async () => {
    await expect(
      requireOperationalPermission("protocol:create"),
    ).rejects.toThrow("nemáte přidělené oprávnění");
  });
  it("povolí explicitně přidělené oprávnění a kontroluje přímé i rolové vazby", async () => {
    mocks.grant.mockResolvedValue({ id: "grant" });
    await expect(operationalPageAccess("protocol:create")).resolves.toEqual({
      user,
      allowed: true,
    });
    expect(mocks.grant).toHaveBeenCalledWith({
      where: {
        code: "protocol:create",
        OR: [
          { users: { some: { userId: user.id } } },
          {
            roles: { some: { role: { users: { some: { userId: user.id } } } } },
          },
        ],
      },
    });
    await expect(
      requireOperationalPermission("protocol:create"),
    ).resolves.toEqual(user);
  });
  it("neskrývá skutečnou chybu databáze jako nedostatek oprávnění", async () => {
    mocks.grant.mockRejectedValue(new Error("database unavailable"));
    await expect(operationalPageAccess("protocol:create")).rejects.toThrow(
      "database unavailable",
    );
  });
});
