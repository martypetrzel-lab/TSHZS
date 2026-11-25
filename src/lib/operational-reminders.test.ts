import { describe, expect, it } from "vitest";
import { reminderOffset } from "../../prisma/operational-reminders.mjs";
describe("termíny v Praze", () => {
  const now = new Date("2026-11-25T12:00:00Z");
  it("upozorní 7 dnů před termínem", () =>
    expect(reminderOffset(new Date("2026-12-02T12:00:00Z"), now, [7, 0])).toBe(
      "7",
    ));
  it("upozorní v den termínu", () =>
    expect(reminderOffset(now, now, [7, 0])).toBe("0"));
  it("rozpozná prošlý termín", () =>
    expect(reminderOffset(new Date("2026-11-24T12:00:00Z"), now, [7, 0])).toBe(
      "overdue",
    ));
  it("nezaloží upozornění mimo zvolené intervaly", () =>
    expect(reminderOffset(new Date("2026-12-01T12:00:00Z"), now, [7, 0])).toBe(
      null,
    ));
});
