import Link from "next/link";
import { ModulePage } from "@/components/module-page";
import { suggestCeproTarget } from "@/lib/cepro";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export default async function Page() {
  const now = new Date();
  const [
    items,
    overdue,
    missingRevision,
    unknownDates,
    review,
    serialGroups,
    registrationGroups,
  ] = await Promise.all([
    prisma.equipmentItem.findMany({
      where: { archivedAt: null },
      select: {
        id: true,
        name: true,
        uid: true,
        typeName: true,
        category: true,
        legacyId: true,
        requirements: {
          where: { archivedAt: null },
          select: {
            sourceType: true,
            intervalValue: true,
            intervalUnit: true,
            name: true,
            lastCompletedAt: true,
            nextDueAt: true,
          },
        },
      },
    }),
    prisma.equipmentRequirement.count({
      where: { archivedAt: null, nextDueAt: { lt: now } },
    }),
    prisma.equipmentItem.count({
      where: {
        archivedAt: null,
        requirements: { none: { archivedAt: null, type: "REVISION" } },
      },
    }),
    prisma.equipmentItem.count({
      where: {
        archivedAt: null,
        requirements: {
          some: { archivedAt: null, lastCompletedAt: null, nextDueAt: null },
        },
      },
    }),
    prisma.equipmentItem.count({
      where: { archivedAt: null, needsReview: true },
    }),
    prisma.equipmentItem.groupBy({
      by: ["serialNumber"],
      where: { archivedAt: null, serialNumber: { not: null } },
      _count: { serialNumber: true },
      having: { serialNumber: { _count: { gt: 1 } } },
    }),
    prisma.equipmentItem.groupBy({
      by: ["registrationNumber"],
      where: { archivedAt: null, registrationNumber: { not: null } },
      _count: { registrationNumber: true },
      having: { registrationNumber: { _count: { gt: 1 } } },
    }),
  ]);
  const withoutRule = items.filter(
    (i) =>
      !i.requirements.some((r) => r.sourceType === "INTERNAL_CEPRO") &&
      !suggestCeproTarget(i.name, i.typeName),
  );
  const suggestions = items.filter(
    (i) =>
      !i.requirements.some((r) => r.sourceType === "INTERNAL_CEPRO") &&
      suggestCeproTarget(i.name, i.typeName),
  );
  const legacyMismatch = items.filter(
    (i) =>
      i.requirements.some((r) => r.sourceType === "LEGACY_IMPORT") &&
      suggestCeproTarget(i.name, i.typeName),
  );
  const suspicious = items.filter(
    (i) => i.legacyId && !/^\d+$/.test(i.legacyId.trim()),
  );
  const stats = [
    ["Bez kategorie", 0],
    ["Bez aplikovatelného pravidla", withoutRule.length],
    ["Legacy k porovnání", legacyMismatch.length],
    ["Prošlé kontroly", overdue],
    ["Chybějící revize", missingRevision],
    ["Neznámý poslední termín", unknownDates],
    ["Vyžaduje doplnění", review],
    ["Podezřelé importované ID", suspicious.length],
    ["Duplicitní výrobní čísla", serialGroups.length],
    ["Duplicitní evidenční čísla", registrationGroups.length],
  ];
  return (
    <ModulePage eyebrow="Datová kvalita" title="Kontrola dat">
      <div className="grid-stats data-check-grid">
        {stats.map(([label, count]) => (
          <div
            className={`card stat ${Number(count) > 0 ? "warn" : "ok"}`}
            key={label}
          >
            <span>{label}</span>
            <strong>{count}</strong>
          </div>
        ))}
      </div>
      {suggestions.length > 0 && (
        <section className="card data-check-list">
          <div className="panel-head">
            <h2>Návrhy zařazení – vyžadují potvrzení</h2>
            <Link href="/pravidla/cepro/porovnani">Otevřít porovnání →</Link>
          </div>
          {suggestions.slice(0, 30).map((i) => (
            <div className="deadline" key={i.id}>
              <span className="dot orange" />
              <div>
                <Link href={`/prostredky/${i.id}`}>
                  <strong>{i.name}</strong>
                </Link>
                <span>
                  {i.uid} · návrh {suggestCeproTarget(i.name, i.typeName)}
                </span>
              </div>
            </div>
          ))}
        </section>
      )}
    </ModulePage>
  );
}
