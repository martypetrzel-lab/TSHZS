import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  permissions: vi.fn(),
  documents: vi.fn(),
  events: vi.fn(),
  equipment: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ id: "me", organizationId: "org" }),
}));
vi.mock("@/lib/operational-authorization", () => ({
  operationalPermissions: mocks.permissions,
}));
vi.mock("@/components/module-page", () => ({
  ModulePage: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    operationalProtocol: { findMany: mocks.documents },
    auditLog: { findMany: mocks.events },
    equipmentItem: { findMany: mocks.equipment },
    defect: { findMany: async () => [] },
  },
}));
import Page from "./page";
describe("návaznost protokolů na závady", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permissions.mockResolvedValue(new Set(["protocol:read"]));
    mocks.events.mockResolvedValue([]);
    mocks.equipment.mockResolvedValue([
      { id: "equipment", name: "Proudnice", uid: "UID-TEST" },
    ]);
    mocks.documents.mockResolvedValue([
      {
        id: "doc",
        title: "Protokol mimo provoz",
        number: "MP-001",
        type: "OUT_OF_SERVICE",
        status: "ISSUED",
        items: [{ equipmentId: "equipment" }],
      },
    ]);
  });
  it("zobrazí vystavený protokol i před vznikem závady", async () => {
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain("MP-001");
    expect(html).toContain("Proudnice · UID-TEST");
    expect(html).toContain("Čeká na potvrzení skutečného odstavení");
    expect(html).toContain('href="/protokoly/provozni/doc"');
    expect(mocks.documents.mock.calls[0][0].where.organizationId).toBe("org");
    expect(mocks.documents.mock.calls[0][0].where.status.in).not.toContain(
      "CANCELLED",
    );
  });
  it("skutečně potvrzené odstavení správně označí", async () => {
    mocks.events.mockResolvedValue([
      { entityId: "doc", action: "EQUIPMENT_OUT_OF_SERVICE" },
    ]);
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain("Skutečné odstavení potvrzeno");
    expect(html).not.toContain("Čeká na potvrzení skutečného odstavení");
  });
  it("bez oprávnění protokoly nenačítá", async () => {
    mocks.permissions.mockResolvedValue(new Set());
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    );
    expect(html).not.toContain("MP-001");
    expect(mocks.documents).not.toHaveBeenCalled();
  });
  it.each([
    [[], "Čeká na odeslání návrhu ke schválení"],
    [["REPAIR_SUBMITTED"], "Návrh odeslán – pokračuje v servisním případu"],
  ])("rozlišuje odeslání návrhu opravy (%s)", async (actions, label) => {
    mocks.documents.mockResolvedValue([
      {
        id: "doc",
        title: "Návrh na opravu",
        number: "NO-001",
        type: "REPAIR_PROPOSAL",
        status: "ISSUED",
        items: [{ equipmentId: "equipment" }],
      },
    ]);
    mocks.events.mockResolvedValue(
      (actions as string[]).map((action) => ({ entityId: "doc", action })),
    );
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain(label as string);
    expect(html).toContain("NO-001");
  });
});
