import { describe, expect, it } from "vitest";
import { money, repairCostTotal } from "./operational-money";
describe("přesná evidence nákladů", () => {
  it("sčítá desetinné částky přesně", () =>
    expect(repairCostTotal(["0.10", "0.20", "1,01", "0"]).toFixed(2)).toBe(
      "1.31",
    ));
  it.each(["-1", "NaN", "1.001", "1e4", "Infinity", ""])(
    "odmítne neplatnou částku %s",
    (value) => expect(() => money(value)).toThrow(),
  );
});
