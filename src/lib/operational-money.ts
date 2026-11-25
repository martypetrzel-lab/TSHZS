import { Prisma } from "@prisma/client";
export function money(value: string) {
  if (!/^\d{1,12}(?:[.,]\d{1,2})?$/.test(value.trim()))
    throw new Error(
      "Částku zadejte nezáporně, nejvýše se dvěma desetinnými místy.",
    );
  return new Prisma.Decimal(value.trim().replace(",", "."));
}
export function repairCostTotal(parts: string[]) {
  return parts.reduce(
    (sum, part) => sum.plus(money(part || "0")),
    new Prisma.Decimal(0),
  );
}
