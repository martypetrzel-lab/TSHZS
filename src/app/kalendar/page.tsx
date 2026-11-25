import Link from "next/link";
import { ModulePage } from "@/components/module-page";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { operationalPermissions } from "@/lib/operational-authorization";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser(),
    q = await searchParams,
    permissions = await operationalPermissions(user.id);
  const [requirements, planned, handovers, returns, repairs] =
    await Promise.all([
      prisma.equipmentRequirement.findMany({
        where: {
          archivedAt: null,
          nextDueAt: { not: null },
          equipment: { organizationId: user.organizationId, archivedAt: null },
        },
        include: { equipment: true },
      }),
      prisma.inspection.findMany({
        where: {
          state: "DRAFT",
          scheduledFor: { not: null },
          equipment: { organizationId: user.organizationId },
        },
        include: { equipment: true, requirement: true },
      }),
      permissions.has("protocol:read")
        ? prisma.operationalProtocol.findMany({
            where: {
              organizationId: user.organizationId,
              status: "DRAFT",
              eventPlannedAt: { not: null },
            },
          })
        : [],
      permissions.has("protocol:read")
        ? prisma.handoverMovement.findMany({
            where: {
              returnedAt: null,
              expectedReturnAt: { not: null },
              item: { protocol: { organizationId: user.organizationId } },
            },
            include: { item: true },
          })
        : [],
      permissions.has("repair:manage")
        ? prisma.repairCase.findMany({
            where: {
              organizationId: user.organizationId,
              dueAt: { not: null },
              state: { notIn: ["CLOSED", "CANCELLED", "REJECTED"] },
            },
          })
        : [],
    ]);
  const events = [
    ...requirements.map((r) => ({
      id: r.id,
      date: r.nextDueAt!,
      type: r.type === "REVISION" ? "REVIZE" : "TERMÍN POVINNOSTI",
      title: `${r.equipment.name} · ${r.name}`,
      href: `/prostredky/${r.equipmentId}`,
      color: "warn",
    })),
    ...planned.map((i) => ({
      id: i.id,
      date: i.scheduledFor!,
      type:
        i.requirement?.trigger === "AFTER_REPAIR"
          ? "KONTROLA PO OPRAVĚ"
          : "NAPLÁNOVANÁ KONTROLA",
      title: `${i.equipment.name} · ${i.inspectionType}`,
      href: `/kontroly/provest/${i.requirementId}?draft=${i.id}`,
      color: "soon",
    })),
    ...handovers.map((d) => ({
      id: d.id,
      date: d.eventPlannedAt!,
      type: "PLÁNOVANÁ UDÁLOST",
      title: d.title,
      href: `/protokoly/provozni/${d.id}`,
      color: "neutral",
    })),
    ...returns.map((m) => ({
      id: m.id,
      date: m.expectedReturnAt!,
      type: "TERMÍN VRÁCENÍ",
      title: "Vrácení předaného prostředku",
      href: `/protokoly/provozni/${m.item.protocolId}`,
      color: "danger",
    })),
    ...repairs.map((r) => ({
      id: r.id,
      date: r.dueAt!,
      type: "TERMÍN OPRAVY",
      title: "Dokončení opravy",
      href: `/zavady/${r.id}`,
      color: "danger-dark",
    })),
  ]
    .filter(
      (e) =>
        (!q.typ || e.type === q.typ) &&
        (!q.od || e.date >= new Date(`${q.od}T00:00:00Z`)) &&
        (!q.do || e.date <= new Date(`${q.do}T23:59:59Z`)),
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  return (
    <ModulePage eyebrow="Termíny" title="Kalendář">
      <form className="card inspection-filters">
        <input type="date" name="od" defaultValue={q.od} />
        <input type="date" name="do" defaultValue={q.do} />
        <select name="typ" defaultValue={q.typ}>
          <option value="">Všechny události</option>
          {[
            "REVIZE",
            "TERMÍN POVINNOSTI",
            "NAPLÁNOVANÁ KONTROLA",
            "KONTROLA PO OPRAVĚ",
            "PLÁNOVANÁ UDÁLOST",
            "TERMÍN VRÁCENÍ",
            "TERMÍN OPRAVY",
          ].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <button className="button">Filtrovat</button>
      </form>
      <section className="card">
        {events.map((e) => (
          <Link className="history-row" key={`${e.type}-${e.id}`} href={e.href}>
            <time>{e.date.toLocaleDateString("cs-CZ")}</time>
            <span className={`due-badge ${e.color}`}>{e.type}</span>
            <strong>{e.title}</strong>
          </Link>
        ))}
        {!events.length && <p>Žádné události neodpovídají filtru.</p>}
      </section>
    </ModulePage>
  );
}
