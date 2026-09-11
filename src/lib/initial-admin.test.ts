import { describe, expect, it, vi } from "vitest";
import { seedInitialAdmin } from "../../prisma/initial-admin.mjs";

function existingAdminDatabase() {
  const state = {
    passwordHash: "$2b$12$puvodni-hash",
    roles: ["ADMIN"],
  };
  const db = {
    role: {
      findMany: vi.fn(async () => [
        { id: "role-admin", code: "ADMIN" },
        { id: "role-ts", code: "TS_ADMIN" },
      ]),
    },
    user: {
      findUnique: vi.fn(async () => ({
        id: "initial-user",
        roles: state.roles.map((code) => ({ role: { code } })),
      })),
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    userRole: {
      createMany: vi.fn(async ({ data }: { data: { roleId: string }[] }) => {
        for (const entry of data)
          if (entry.roleId === "role-ts" && !state.roles.includes("TS_ADMIN"))
            state.roles.push("TS_ADMIN");
        return { count: data.length };
      }),
    },
  };
  return { db, state };
}

describe("produkční inicializační administrátor", () => {
  it("existujícímu ADMIN doplní TS_ADMIN bez změny hesla", async () => {
    const { db, state } = existingAdminDatabase();
    const hashPassword = vi.fn();
    const originalHash = state.passwordHash;
    const result = await seedInitialAdmin(db, "org", {
      username: "railway-admin",
      password: "tajne-heslo",
      hashPassword,
    });
    expect(result.addedRoles).toEqual(["TS_ADMIN"]);
    expect(state.roles).toEqual(["ADMIN", "TS_ADMIN"]);
    expect(state.passwordHash).toBe(originalHash);
    expect(hashPassword).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("další seed nevytvoří duplicitní UserRole", async () => {
    const { db, state } = existingAdminDatabase();
    const options = {
      username: "railway-admin",
      password: "tajne-heslo",
      hashPassword: vi.fn(),
    };
    await seedInitialAdmin(db, "org", options);
    await seedInitialAdmin(db, "org", options);
    expect(state.roles).toEqual(["ADMIN", "TS_ADMIN"]);
    expect(db.userRole.createMany).toHaveBeenCalledTimes(1);
  });
});
