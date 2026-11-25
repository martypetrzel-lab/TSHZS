import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
export async function repairStatistics(
  organizationId: string,
  q: Record<string, string | undefined>,
) {
  const equipment = await prisma.equipmentItem.findMany({
    where: {
      organizationId,
      ...(q.vozidlo ? { vehicleId: q.vozidlo } : {}),
      ...(q.kategorie ? { categoryId: q.kategorie } : {}),
      ...(q.prostredek ? { id: q.prostredek } : {}),
    },
    include: { vehicle: true, category: true },
  });
  const repairs = await prisma.repairCase.findMany({
    where: {
      organizationId,
      equipmentId: { in: equipment.map((e) => e.id) },
      state: { not: "CANCELLED" },
      ...(q.dodavatel ? { supplierId: q.dodavatel } : {}),
      ...(q.mena ? { currency: q.mena } : {}),
    },
    include: { supplier: true, events: true },
  });
  const year =
    q.rok === "vse" ? null : Number(q.rok ?? new Date().getFullYear());
  const filtered = repairs.filter((r) => {
    const date = r.invoiceDate ?? r.completedAt ?? r.createdAt;
    return (
      (year === null || date.getUTCFullYear() === year) &&
      (!q.od || date >= new Date(`${q.od}T00:00:00Z`)) &&
      (!q.do || date <= new Date(`${q.do}T23:59:59Z`))
    );
  });
  const total = filtered.reduce(
    (sum, r) => sum.plus(r.actualCost ?? 0),
    new Prisma.Decimal(0),
  );
  const estimate = filtered.reduce(
    (sum, r) => sum.plus(r.estimatedCost ?? 0),
    new Prisma.Decimal(0),
  );
  const months = new Map<string, Prisma.Decimal>(),
    groups = new Map<string, Prisma.Decimal>();
  for (const repair of filtered) {
    const date = repair.invoiceDate ?? repair.completedAt ?? repair.createdAt,
      month = date.toISOString().slice(0, 7);
    months.set(
      month,
      (months.get(month) ?? new Prisma.Decimal(0)).plus(repair.actualCost ?? 0),
    );
    const e = equipment.find((e) => e.id === repair.equipmentId);
    for (const key of [
      `Prostředek: ${e?.name ?? "—"}`,
      `Vozidlo: ${e?.vehicle?.name ?? "Nepřiřazeno"}`,
      `Kategorie: ${e?.category.name ?? "—"}`,
      `Servis: ${repair.supplier?.name ?? "Neuveden"}`,
    ])
      groups.set(
        key,
        (groups.get(key) ?? new Prisma.Decimal(0)).plus(repair.actualCost ?? 0),
      );
  }
  const completed = filtered.filter((r) => r.completedAt);
  const averageDays = completed.length
    ? completed.reduce(
        (sum, r) =>
          sum + (r.completedAt!.getTime() - r.createdAt.getTime()) / 86400000,
        0,
      ) / completed.length
    : null;
  const currencies = [...new Set(filtered.map((r) => r.currency))];
  const history = await prisma.equipmentStatusHistory.findMany({
    where: { equipmentId: { in: equipment.map((e) => e.id) } },
    orderBy: { changedAt: "asc" },
  });
  const rangeStart = q.od
    ? new Date(`${q.od}T00:00:00Z`)
    : year
      ? new Date(Date.UTC(year, 0, 1))
      : new Date(0);
  const rangeEnd = q.do
    ? new Date(`${q.do}T23:59:59Z`)
    : year
      ? new Date(Date.UTC(year + 1, 0, 1))
      : new Date();
  let downtimeDays = 0;
  for (const e of equipment) {
    let since: Date | null = null;
    for (const entry of history.filter((h) => h.equipmentId === e.id)) {
      if (entry.toStatus === "OUT_OF_SERVICE" && !since)
        since = entry.changedAt;
      if (entry.toStatus === "IN_SERVICE" && since) {
        downtimeDays +=
          Math.max(
            0,
            Math.min(rangeEnd.getTime(), entry.changedAt.getTime()) -
              Math.max(rangeStart.getTime(), since.getTime()),
          ) / 86400000;
        since = null;
      }
    }
    if (since)
      downtimeDays +=
        Math.max(
          0,
          Math.min(Date.now(), rangeEnd.getTime()) -
            Math.max(rangeStart.getTime(), since.getTime()),
        ) / 86400000;
  }
  // Never add amounts expressed in different currencies.
  return {
    equipment,
    repairs: filtered,
    total,
    estimate,
    months,
    groups,
    averageDays,
    currencies,
    downtimeDays,
  };
}
