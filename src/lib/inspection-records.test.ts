import { describe, expect, it } from "vitest";
import {
  CEPRO_DETAILED_CHECKLISTS,
  CEPRO_RULES,
} from "../../prisma/cepro-methodology.mjs";
import { addCalendarInterval, nextOperatingThreshold } from "./rule-engine";
import {
  assertInspectionMutable,
  calculateInspectionResult,
  correctionRecord,
  equipmentOutcome,
  validateChecklistCompletion,
} from "./inspection-records";
import {
  checklistKeyForRule,
  ruleVersionStrategy,
} from "../../prisma/checklist-mapping.mjs";
import { selectUnambiguousRule } from "./checklist-matching";

describe("uzavření kontrolního checklistu", () => {
  it("odmítne nevyplněný povinný bod", () =>
    expect(validateChecklistCompletion([{ required: true }]).valid).toBe(
      false,
    ));
  it("odmítne nepovolené N/A", () =>
    expect(
      validateChecklistCompletion([{ required: true, notApplicable: true }])
        .invalidNa,
    ).toHaveLength(1));
  it("vyžaduje důvod N/A podle konfigurace", () =>
    expect(
      validateChecklistCompletion([
        {
          required: true,
          notApplicable: true,
          allowNotApplicable: true,
          naRequiresReason: true,
        },
      ]).valid,
    ).toBe(false));
  it("vyžaduje poznámku a fotografii při nevyhovění", () =>
    expect(
      validateChecklistCompletion([
        {
          required: true,
          value: "NEVYHOVUJE",
          failRequiresNote: true,
          failRequiresPhoto: true,
        },
      ]).valid,
    ).toBe(false));
  it("kritický nevyhovující bod vždy vypočítá FAILED", () =>
    expect(
      calculateInspectionResult(
        [{ required: true, value: "NEVYHOVUJE", critical: true }],
        {
          allowPassedWithLimitation: true,
          nonCriticalFailureResult: "PASSED_WITH_LIMITATION",
        },
      ),
    ).toBe("FAILED"));
  it("nekritická závada může vytvořit omezení pouze konfigurací", () =>
    expect(
      calculateInspectionResult([{ required: true, value: "NEVYHOVUJE" }], {
        allowPassedWithLimitation: true,
        nonCriticalFailureResult: "PASSED_WITH_LIMITATION",
      }),
    ).toBe("PASSED_WITH_LIMITATION"));
  it("servisní symbol AED ANO je kritické selhání", () =>
    expect(
      calculateInspectionResult(
        [{ required: true, value: true, failureValue: true, critical: true }],
        {
          allowPassedWithLimitation: false,
          nonCriticalFailureResult: "FAILED",
        },
      ),
    ).toBe("FAILED"));
  it("FAILED vyřadí prostředek a vytvoří kritickou závadu", () =>
    expect(equipmentOutcome("FAILED")).toMatchObject({
      equipmentStatus: "OUT_OF_SERVICE",
      createDefect: true,
      severity: "CRITICAL",
    }));
});

describe("termíny a neměnnost", () => {
  it("počítá šest měsíců kalendářně", () => {
    const result = addCalendarInterval(new Date(2026, 8, 11, 10), 6, "MONTHS");
    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual(
      [2027, 2, 11],
    );
  });
  it("počítá rok kalendářně", () =>
    expect(
      addCalendarInterval(
        new Date("2024-02-29T10:00:00Z"),
        1,
        "YEARS",
      ).getUTCFullYear(),
    ).toBe(2025));
  it("počítá další práh motohodin", () =>
    expect(nextOperatingThreshold(96.5, 10)).toBe(100));
  it("uzavřený záznam nelze měnit", () =>
    expect(() => assertInspectionMutable("CLOSED")).toThrow(/neměnný/));
  it("opravný záznam vyžaduje důvod", () =>
    expect(() => correctionRecord("x", "")).toThrow(/povinný/));
});

describe("konkrétní metodické checklisty", () => {
  it("žebřík obsahuje prohlídku, funkčnost a identifikaci", () =>
    expect(
      CEPRO_DETAILED_CHECKLISTS.ladder.map((s: { title: string }) => s.title),
    ).toEqual(["Prohlídka", "Funkčnost", "Identifikace"]));
  it("vaky zastaví tlakovou část po závadě prohlídky", () =>
    expect(CEPRO_DETAILED_CHECKLISTS.bag[1].conditionJson).toMatchObject({
      stopWhenPreviousSectionFailed: true,
    }));
  it("sací hadice má tři číselná měření", () =>
    expect(
      CEPRO_DETAILED_CHECKLISTS["suction-hose"][1].items.every(
        (i: { responseType: string }) => i.responseType === "MEASUREMENT",
      ),
    ).toBe(true));
  it("čerpadlo má tři samostatné intervaly", () =>
    expect(
      CEPRO_RULES.filter(
        (r: { targetKey: string; trigger: string }) =>
          r.targetKey === "FIRE_PUMP" && r.trigger === "PERIODIC",
      ),
    ).toHaveLength(3));
  it("rozlišuje uživatelskou a odbornou úroveň z pravidel", () => {
    expect(
      CEPRO_RULES.some(
        (r: { performedBy: string }) => r.performedBy === "uživatel",
      ),
    ).toBe(true);
    expect(
      CEPRO_RULES.some((r: { performedBy: string }) =>
        /technik/.test(r.performedBy),
      ),
    ).toBe(true);
  });
});

describe("mapování povinností na checklisty", () => {
  it("novému žebříku přiřadí ladder checklist", () =>
    expect(
      checklistKeyForRule({
        targetKey: "LADDER",
        name: "Odborná kontrola",
        performedBy: "technik TS",
        type: "INSPECTION",
      }),
    ).toBe("ladder"));
  it("externí nedestruktivní zkoušce žebříku interní checklist nepřiřadí", () =>
    expect(
      checklistKeyForRule({
        targetKey: "LADDER",
        name: "Nedestruktivní zkouška",
        performedBy: "výrobce",
        type: "INSPECTION",
      }),
    ).toBeNull());
  it("general-ts vzniká jen jako explicitní mapování pravidla", () =>
    expect(
      checklistKeyForRule({
        targetKey: "NOZZLE",
        name: "Kontrola",
        performedBy: "technik TS",
        type: "INSPECTION",
      }),
    ).toBe("general-ts"));
  it("legacy povinnost s jedinou shodou nabídne pravidlo ČEPRO", () =>
    expect(
      selectUnambiguousRule(
        { name: "Roční kontrola", intervalValue: 12, intervalUnit: "MONTHS" },
        [
          {
            id: "cepro",
            name: "Odborná kontrola",
            intervalValue: 12,
            intervalUnit: "MONTHS",
            performedBy: "technik TS",
          },
        ],
      )?.id,
    ).toBe("cepro"));
  it("nejednoznačný legacy záznam vyžaduje ruční rozhodnutí", () =>
    expect(
      selectUnambiguousRule(
        { name: "Kontrola", intervalValue: null, intervalUnit: null },
        [
          {
            id: "a",
            name: "Denní kontrola",
            intervalValue: 1,
            intervalUnit: "DAYS",
            performedBy: "uživatel",
          },
          {
            id: "b",
            name: "Týdenní kontrola",
            intervalValue: 1,
            intervalUnit: "WEEKS",
            performedBy: "technik TS",
          },
        ],
      ),
    ).toBeNull());
  it("nepřepíše historicky použitou RuleVersion", () =>
    expect(
      ruleVersionStrategy({
        currentChecklistId: null,
        desiredChecklistId: "ladder",
        historicallyUsed: true,
        safeVersionExists: false,
      }),
    ).toBe("CREATE_VERSION"));
  it("nepoužitou RuleVersion bezpečně doplní", () =>
    expect(
      ruleVersionStrategy({
        currentChecklistId: null,
        desiredChecklistId: "ladder",
        historicallyUsed: false,
        safeVersionExists: false,
      }),
    ).toBe("UPDATE_UNUSED"));
});
