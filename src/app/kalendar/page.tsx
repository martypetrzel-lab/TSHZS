import { ModulePage } from "@/components/module-page";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export default async function Page() {
  const [requirements, planned] = await Promise.all([
    prisma.equipmentRequirement.findMany({ where: { archivedAt: null, nextDueAt: { not: null }, equipment: { archivedAt: null } }, include: { equipment: true }, orderBy: { nextDueAt: "asc" }, take: 200 }),
    prisma.inspection.findMany({ where: { state: "DRAFT", scheduledFor: { not: null } }, include: { equipment: true, requirement: true }, orderBy: { scheduledFor: "asc" }, take: 200 }),
  ]);
  return (
    <ModulePage eyebrow="Termíny" title="Kalendář">
      <div className="dashboard-grid">
        <section className="card"><h2>Termíny povinností</h2>{requirements.map((entry) => <div className="history-row" key={entry.id}><span className="badge">TERMÍN POVINNOSTI</span><strong>{entry.equipment.name}</strong><span>{entry.name}</span><time>{entry.nextDueAt?.toLocaleDateString("cs-CZ")}</time></div>)}</section>
        <section className="card"><h2>Naplánované kontroly</h2>{planned.map((entry) => <div className="history-row" key={entry.id}><span className="badge">NAPLÁNOVANÁ KONTROLA</span><strong>{entry.equipment.name}</strong><span>{entry.requirement?.name ?? entry.inspectionType}</span><time>{entry.scheduledFor?.toLocaleDateString("cs-CZ")}</time></div>)}</section>
      </div>
    </ModulePage>
  );
}
