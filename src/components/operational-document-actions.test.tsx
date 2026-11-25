import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/app/actions/operational-protocols", () => ({
  grantOperationalPermission: vi.fn(),
  deleteOperationalDraft: vi.fn(),
  cancelOperationalProtocol: vi.fn(),
}));
vi.mock("@/components/operational-action-form", () => ({
  OperationalActionForm: ({ children }: { children: React.ReactNode }) => (
    <form>{children}</form>
  ),
}));
import { OperationalDocumentActions } from "./operational-document-actions";
function render(
  status: string,
  codes: string[] = [],
  role = "ADMIN",
  owner = "me",
) {
  return renderToStaticMarkup(
    <OperationalDocumentActions
      doc={{
        id: "doc",
        title: "Protokol mimo provoz",
        status,
        createdById: owner,
        hasAppendix: true,
        hasDecisions: false,
      }}
      user={{ id: "me", roles: [{ role: { code: role } }] }}
      permissions={new Set(codes)}
    />,
  );
}
describe("tisk a správa dokumentu", () => {
  it("adminovi bez oprávnění nabídne výslovné povolení tisku a storna", () => {
    const html = render("ISSUED");
    expect(html).toContain("Povolit pro můj účet: Tisk a stahování PDF");
    expect(html).toContain('name="permission" value="protocol:download"');
    expect(html).toContain('name="permission" value="protocol:cancel"');
    expect(html).not.toContain("Smazat rozpracovaný protokol");
  });
  it("běžnému uživateli nenabídne přidělení vlastních oprávnění", () => {
    expect(render("ISSUED", [], "USER")).not.toContain('name="permission"');
  });
  it("tisk otevře samostatně a stažení nabídne zvlášť", () => {
    const html = render("ISSUED", ["protocol:download"]);
    expect(html).toContain(
      'href="/api/protokoly/doc/pdf?zobrazeni=tisk" target="_blank"',
    );
    expect(html).toContain('href="/api/protokoly/doc/pdf"');
  });
  it("dovolí smazání pouze vlastního návrhu", () => {
    expect(render("DRAFT", ["protocol:edit_draft"])).toContain(
      "Smazat rozpracovaný protokol",
    );
    expect(
      render("DRAFT", ["protocol:edit_draft"], "ADMIN", "other"),
    ).not.toContain("Smazat rozpracovaný protokol");
  });
  it("vystavený dokument nabízí jen storno s povinným důvodem", () => {
    const html = render("ISSUED", ["protocol:cancel", "protocol:edit_draft"]);
    expect(html).toContain("Potvrdit storno protokolu");
    expect(html).toContain('textarea name="reason" required=""');
    expect(html).not.toContain("Smazat rozpracovaný protokol");
  });
  it("stornovaný dokument nelze znovu stornovat ani smazat", () => {
    const html = render("CANCELLED", [
      "protocol:cancel",
      "protocol:edit_draft",
    ]);
    expect(html).not.toContain("Potvrdit storno protokolu");
    expect(html).not.toContain("Smazat rozpracovaný protokol");
  });
});
