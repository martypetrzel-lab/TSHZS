import { describe, expect, it } from "vitest";
import { CEPRO_RULES } from "../../prisma/cepro-methodology.mjs";
import {
  assertInspectionMutable,
  correctionRecord,
  validateChecklistCompletion,
} from "./inspection-records";
import {
  evaluateRules,
  legacyComparison,
  nextOperatingThreshold,
} from "./rule-engine";

const forTarget = (key: string) =>
  CEPRO_RULES.filter((r) => r.targetKey === key && r.trigger === "PERIODIC");
const intervals = (key: string) =>
  forTarget(key).map((r) => `${r.intervalValue}:${r.intervalUnit}`);

describe("metodika HZS ČEPRO", () => {
  it("má stabilní jedinečný klíč každého seedovaného pravidla", () => {
    const keys = CEPRO_RULES.map(
      (r) =>
        `${r.targetKey}:${r.name}:${r.trigger}:${r.intervalValue}:${r.intervalUnit}:${r.performedBy}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("vede pro žebřík nezávisle 6 měsíců a 5 let", () =>
    expect(intervals("LADDER")).toEqual(
      expect.arrayContaining(["6:MONTHS", "5:YEARS"]),
    ));
  it("vede pro zvedací vak 12 a 60 měsíců", () =>
    expect(intervals("LIFTING_BAG")).toEqual(
      expect.arrayContaining(["12:MONTHS", "60:MONTHS"]),
    ));
  it("vede ruční kontrolu AED každých 7 dní", () =>
    expect(forTarget("AED")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Ruční odborná kontrola",
          intervalValue: 1,
          intervalUnit: "WEEKS",
        }),
      ]),
    ));
  it("vede termokameru denně, týdně a měsíčně", () =>
    expect(intervals("THERMAL_CAMERA")).toEqual(
      expect.arrayContaining(["1:DAYS", "1:WEEKS", "1:MONTHS"]),
    ));
  it("vede čerpadlo týdně, za 3 měsíce a za rok", () =>
    expect(intervals("FIRE_PUMP")).toEqual(
      expect.arrayContaining(["1:WEEKS", "3:MONTHS", "12:MONTHS"]),
    ));
  it("počítá další servisní práh kompresoru v motohodinách", () =>
    expect(nextOperatingThreshold(96.5, 10)).toBe(100));
  it("označí rozdílný legacy interval jako nesoulad", () =>
    expect(
      legacyComparison(
        [
          {
            id: "legacy",
            name: "Kontrola",
            validFrom: new Date(0),
            intervalValue: 12,
            intervalUnit: "MONTHS",
            sourceType: "LEGACY_IMPORT",
          },
        ],
        [
          {
            id: "cepro",
            name: "Kontrola",
            validFrom: new Date(0),
            intervalValue: 6,
            intervalUnit: "MONTHS",
            sourceType: "INTERNAL_CEPRO",
          },
        ],
      ).status,
    ).toBe("NESOULAD"));
  it("event-based požadavek nevytváří kalendářní termín", () =>
    expect(
      evaluateRules(
        [
          {
            id: "event",
            name: "Po použití",
            validFrom: new Date(0),
            intervalValue: 1,
            intervalUnit: "DAYS",
            trigger: "AFTER_USE",
          },
        ],
        new Date("2026-01-01"),
      ).dueAt,
    ).toBeNull());
  it("ponechá požadavek výrobce vedle interní metodiky a rozhodne bezpečnější termín", () => {
    const result = evaluateRules(
      [
        {
          id: "cepro",
          name: "Kontrola",
          validFrom: new Date(0),
          intervalValue: 12,
          intervalUnit: "MONTHS",
          sourceType: "INTERNAL_CEPRO",
        },
        {
          id: "maker",
          name: "Kontrola",
          validFrom: new Date(0),
          intervalValue: 6,
          intervalUnit: "MONTHS",
          sourceType: "MANUFACTURER",
        },
      ],
      new Date("2026-01-01"),
      new Date("2026-02-01"),
    );
    expect(result.applicable).toHaveLength(2);
    expect(result.decisive?.id).toBe("maker");
  });
});

describe("neměnnost protokolů", () => {
  it("odmítne přímou změnu uzavřeného protokolu", () =>
    expect(() => assertInspectionMutable("CLOSED")).toThrow(/neměnný/));
  it("vyžaduje opravný záznam s vazbou a důvodem", () =>
    expect(correctionRecord("original", "Oprava měření")).toMatchObject({
      correctionOfId: "original",
      correctionReason: "Oprava měření",
      state: "CORRECTED",
    }));
  it("neuzavře checklist s nevyplněnou povinnou hodnotou", () =>
    expect(validateChecklistCompletion([{ required: true }]).valid).toBe(
      false,
    ));
});
