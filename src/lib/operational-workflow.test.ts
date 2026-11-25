import { describe, expect, it } from "vitest";
import { operationalCounterKey, assertFinancialApproval, assertRepairTransition, assertReturnToService } from "./operational-workflow";
describe("provozní workflow", () => {
  it("odděluje roční číselné řady druhů dokumentů", () => {
    expect(operationalCounterKey("HANDOVER", new Date("2026-12-31T12:00:00Z"))).toBe("PP-MST-2026");
    expect(operationalCounterKey("HANDOVER", new Date("2027-01-01T12:00:00Z"))).toBe("PP-MST-2027");
    expect(operationalCounterKey("OUT_OF_SERVICE", new Date("2026-11-25T12:00:00Z"))).toBe("MP-MST-2026");
    expect(operationalCounterKey("REPAIR_PROPOSAL", new Date("2026-11-25T12:00:00Z"))).toBe("NO-MST-2026");
  });
  it("nepovolí objednat neschválenou opravu", () => expect(() => assertRepairTransition("PENDING_APPROVAL", "ORDERED")).toThrow());
  it("povolí objednat schválenou opravu", () => expect(() => assertRepairTransition("APPROVED", "ORDERED")).not.toThrow());
  it.each([
    { authorId: "a", actorId: "a", allowed: true, reason: "Souhlas" },
    { authorId: "a", actorId: "b", allowed: false, reason: "Souhlas" },
    { authorId: "a", actorId: "b", allowed: true, reason: " " },
  ])("chrání finanční rozhodnutí %j", input => expect(() => assertFinancialApproval(input)).toThrow());
  it("povolí rozhodnutí jiné oprávněné osoby", () => expect(() => assertFinancialApproval({ authorId: "a", actorId: "b", allowed: true, reason: "Souhlas s limitem" })).not.toThrow());
  const ready = { blockingDefects: 0, blockingRequirements: 0, activeHandovers: 0, passedInspection: true, serviceReport: true };
  it.each([ { blockingDefects: 1 }, { blockingRequirements: 1 }, { activeHandovers: 1 }, { passedInspection: false }, { serviceReport: false } ])("blokuje předčasný návrat %j", condition => expect(() => assertReturnToService({ ...ready, ...condition })).toThrow());
  it("povolí návrat po splnění všech podmínek", () => expect(() => assertReturnToService(ready)).not.toThrow());
});
