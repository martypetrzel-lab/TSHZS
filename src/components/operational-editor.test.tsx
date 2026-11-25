import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/app/actions/operational-protocols", () => ({
  saveOperationalDraft: vi.fn(),
}));
vi.mock("@/components/operational-action-form", () => ({
  OperationalActionForm: ({ children }: { children: React.ReactNode }) => (
    <form>{children}</form>
  ),
}));
import { OperationalEditor } from "./operational-editor";

function render(type: string, existing = false) {
  return renderToStaticMarkup(
    <OperationalEditor
      equipment={[
        {
          id: "item",
          name: "Testovací prostředek",
          uid: "UID-TEST",
          serialNumber: "SN-1",
          registrationNumber: null,
          legacyId: null,
          manufacturer: null,
          model: null,
          quantity: 1,
          vehicle: "",
          location: "Sklad",
          activeHandover: false,
        },
      ]}
      users={[]}
      suppliers={[]}
      vehicles={[]}
      locations={[]}
      initialType={type}
      initial={{
        reason: "Test",
        expectedReturn: "2026-12-01",
        estimatedCost: "450",
        recipient: "Původní příjemce",
      }}
      docId={existing ? "draft" : undefined}
      date="2026-11-25"
      selectedIds={["item"]}
      itemDetails={{
        item: { description: "Původní upřesnění", quantity: "1" },
      }}
      canIssue={existing}
    />,
  );
}
function editableNames(html: string) {
  return (html.match(/<(?:input|select|textarea)\b[^>]*>/g) ?? [])
    .filter((tag) => !tag.includes('type="hidden"'))
    .map((tag) => /name="([^"]+)"/.exec(tag)?.[1])
    .filter(Boolean);
}
describe("samostatné formuláře provozních protokolů", () => {
  it("předání nabízí strany, příslušenství a vrácení, bez polí o ceně a závažnosti", () => {
    const names = editableNames(render("HANDOVER"));
    expect(names).toEqual(
      expect.arrayContaining([
        "recipient",
        "sender",
        "expectedReturn",
        "handoverPurpose",
        "accessories-item",
        "condition-item",
        "targetLocationId",
      ]),
    );
    for (const key of [
      "estimatedCost",
      "severity",
      "measures",
      "justification",
      "dueDate",
    ])
      expect(names).not.toContain(key);
  });
  it("odstavení nabízí technický stav a opatření, bez příjemce a ceny", () => {
    const names = editableNames(render("OUT_OF_SERVICE"));
    expect(names).toEqual(
      expect.arrayContaining([
        "reason",
        "description",
        "severity",
        "foundDate",
        "foundBy",
        "measures",
        "eventOccurredAt",
      ]),
    );
    for (const key of [
      "recipient",
      "expectedReturn",
      "estimatedCost",
      "quoteNumber",
      "handoverPurpose",
      "accessories-item",
    ])
      expect(names).not.toContain(key);
  });
  it("návrh opravy nabízí rozsah, odůvodnění a cenu, bez údajů o předání a odstavení", () => {
    const names = editableNames(render("REPAIR_PROPOSAL"));
    expect(names).toEqual(
      expect.arrayContaining([
        "description",
        "solution",
        "justification",
        "estimatedCost",
        "currency",
        "supplierId",
        "dueDate",
        "quoteNumber",
      ]),
    );
    for (const key of [
      "recipient",
      "expectedReturn",
      "severity",
      "eventOccurredAt",
      "eventPlannedAt",
      "targetVehicleId",
      "accessories-item",
    ])
      expect(names).not.toContain(key);
  });
  it("u rozpracovaného návrhu uloží vyplněná pole a vystaví jej jedním tlačítkem", () => {
    const html = render("REPAIR_PROPOSAL", true);
    for (const key of ["reason", "description", "solution", "justification"])
      expect(html).toMatch(
        new RegExp(`name="${key}"[^>]*required|required=""[^>]*name="${key}"`),
      );
    expect(html).toMatch(/name="submitMode"[^>]*value="save"|value="save"[^>]*name="submitMode"/);
    expect(html).toMatch(/name="submitMode"[^>]*value="issue"|value="issue"[^>]*name="submitMode"/);
    expect(html).toContain("Uložit změny a vystavit protokol");
  });
  it.each(["HANDOVER", "OUT_OF_SERVICE", "REPAIR_PROPOSAL"])(
    "druh %s je pevný a nelze jej změnit přepínačem",
    (type) => {
      const html = render(type);
      expect(html).toContain(`type="hidden" name="type" value="${type}"`);
      expect(editableNames(html)).not.toContain("type");
    },
  );
  it("při editaci zachová dříve vyplněná pole a detaily, i když do nového formuláře nepatří", () => {
    const html = render("OUT_OF_SERVICE", true);
    expect(html).toContain('name="estimatedCost" value="450"');
    expect(html).toContain('name="expectedReturn" value="2026-12-01"');
    expect(html).toContain('name="description-item" value="Původní upřesnění"');
  });
  it("do nového návrhu opravy nepřenese příjemce a termín vrácení ze zdrojového protokolu", () => {
    const html = render("REPAIR_PROPOSAL");
    expect(html).toContain('name="recipient" value=""');
    expect(html).toContain('name="expectedReturn" value=""');
  });
});
