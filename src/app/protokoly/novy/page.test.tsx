import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/operational-authorization", () => ({
  operationalPageAccess: mocks.access,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { inspection: { findFirst: mocks.query } },
}));
vi.mock("@/components/module-page", () => ({
  ModulePage: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock("@/components/operational-editor-loader", () => ({
  OperationalEditorLoader: () => <form aria-label="Editor protokolu" />,
}));
import Page from "./page";

describe("Nový provozní protokol", () => {
  it.each(["ADMIN", "USER"])(
    "bez oprávnění zobrazí zprávu místo pádu (%s)",
    async (role) => {
      mocks.query.mockClear();
      mocks.access.mockResolvedValue({
        allowed: false,
        user: { id: "me", roles: [{ role: { code: role } }] },
      });
      const html = renderToStaticMarkup(
        await Page({
          searchParams: Promise.resolve({ inspectionId: "private" }),
        }),
      );
      expect(html).toContain("Chybí provozní oprávnění");
      expect(html).toContain("Vytvářet protokoly");
      expect(html.includes("Nastavit oprávnění pro můj účet")).toBe(
        role === "ADMIN",
      );
      expect(html).not.toContain("Editor protokolu");
      expect(mocks.query).not.toHaveBeenCalled();
    },
  );
  it("s oprávněním zobrazí editor", async () => {
    mocks.access.mockResolvedValue({
      allowed: true,
      user: { id: "me", displayName: "Technik", organizationId: "org" },
    });
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain("Editor protokolu");
    expect(html).not.toContain("Chybí provozní oprávnění");
  });
});
