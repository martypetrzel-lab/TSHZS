import { describe, expect, it } from "vitest";
import {
  canUseHistoricalDates,
  nextDueFromPerformedAt,
  parseDateOnly,
  protocolCounterKey,
  historyYear,
  restoreRequirementFromValidInspections,
} from "./inspection-lifecycle";

describe("inspection lifecycle", () => {
  it("počítá další termín ze skutečného data kalendářně", () => {
    expect(nextDueFromPerformedAt({ performedAt: parseDateOnly("2026-06-15", "Datum"), intervalValue: 6, intervalUnit: "MONTHS", result: "PASSED", trigger: "PERIODIC" })?.toISOString().slice(0, 10)).toBe("2026-12-15");
  });
  it("odděluje roční číselné řady podle data protokolu", () => {
    expect(protocolCounterKey(parseDateOnly("2026-12-31", "Datum"))).toBe("TS-MST-2026");
    expect(protocolCounterKey(parseDateOnly("2027-01-01", "Datum"))).toBe("TS-MST-2027");
  });
  it("nepovolí historický zápis samotnému ADMIN ani TECHNICIAN", () => {
    expect(canUseHistoricalDates(["ADMIN"])).toBe(false);
    expect(canUseHistoricalDates(["TECHNICIAN"])).toBe(false);
    expect(canUseHistoricalDates(["TS_ADMIN"])).toBe(true);
    expect(canUseHistoricalDates(["ADMIN", "TECHNICIAN"])).toBe(true);
  });
  it("rok historie odvozuje z data protokolu", () => {
    expect(historyYear({ protocolDate: parseDateOnly("2025-06-15", "Datum"), createdAt: parseDateOnly("2026-09-11", "Datum") })).toBe(2025);
  });
  it("po stornu obnoví stav z poslední předchozí platné kontroly", () => {
    const restored = restoreRequirementFromValidInspections([
      { performedAt: parseDateOnly("2026-03-01", "Datum"), completedAt: null, result: "PASSED", nextDueAt: "2026-09-01T12:00:00.000Z" },
    ]);
    expect(restored.lastCompletedAt?.toISOString().slice(0, 10)).toBe("2026-03-01");
    expect(restored.nextDueAt?.toISOString().slice(0, 10)).toBe("2026-09-01");
  });
  it("bez předchozí platné kontroly obnoví neurčený stav", () => {
    expect(restoreRequirementFromValidInspections([])).toEqual({ lastCompletedAt: null, nextDueAt: null, status: "UNDEFINED" });
  });
});
