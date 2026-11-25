import Link from "next/link";
import { ModulePage } from "@/components/module-page";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { repairStates } from "@/lib/operational-workflow";
import { operationalPermissions } from "@/lib/operational-authorization";
import { operationalProtocolProgress } from "@/lib/operational-progress";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  const permissions = await operationalPermissions(user.id);
  const protocols = permissions.has("protocol:read")
    ? await prisma.operationalProtocol.findMany({
        where: {
          organizationId: user.organizationId,
          type: { in: ["OUT_OF_SERVICE", "REPAIR_PROPOSAL"] },
          status: { in: ["DRAFT", "ISSUED"] },
        },
        select: {
          id: true,
          title: true,
          number: true,
          type: true,
          status: true,
          protocolDate: true,
          items: { select: { equipmentId: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      })
    : [];
  const protocolEquipment = protocols.length
    ? await prisma.equipmentItem.findMany({
        where: {
          organizationId: user.organizationId,
          id: {
            in: protocols.flatMap((p) =>
              p.items.map((item) => item.equipmentId),
            ),
          },
        },
        select: { id: true, name: true, uid: true },
      })
    : [];
  const protocolEvents = protocols.length
    ? await prisma.auditLog.findMany({
        where: {
          entityType: "OperationalProtocol",
          entityId: { in: protocols.map((p) => p.id) },
          action: { in: ["EQUIPMENT_OUT_OF_SERVICE", "REPAIR_SUBMITTED"] },
        },
        select: { entityId: true, action: true },
      })
    : [];
  const defects = await prisma.defect.findMany({
    where: {
      equipment: {
        organizationId: user.organizationId,
        ...(q.mimoProvoz ? { status: "OUT_OF_SERVICE" } : {}),
      },
      ...(q.historie !== "1" ? { closedAt: null } : {}),
      ...(q.kriticke === "1" ? { severity: "CRITICAL" } : {}),
    },
    include: { equipment: true },
    orderBy: { foundAt: "desc" },
  });
  const repairs =
    permissions.has("repair:manage") || permissions.has("repair:approve")
      ? (
          await prisma.repairCase.findMany({
            where: { organizationId: user.organizationId },
            orderBy: { updatedAt: "desc" },
          })
        ).filter(
          (r) =>
            (!q.stav || r.state === q.stav) &&
            (!q.poTerminu ||
              (r.dueAt &&
                r.dueAt < new Date() &&
                !["CLOSED", "CANCELLED"].includes(r.state))),
        )
      : [];
  return (
    <ModulePage eyebrow="Servis" title="Závady a opravy">
      <nav className="inspection-tabs">
        <Link href="/zavady">Aktivní závady</Link>
        <Link href="/zavady?mimoProvoz=1">Mimo provoz</Link>
        {Object.entries(repairStates).map(([state, label]) => (
          <Link key={state} href={`/zavady?stav=${state}`}>
            {label}
          </Link>
        ))}
        <Link href="/zavady?historie=1">Historie</Link>
        <Link href="/zavady/statistiky">Statistiky nákladů</Link>
        <Link href="/dodavatele">Servisní organizace</Link>
      </nav>
      <div className="row-actions">
        <Link className="button" href="/protokoly/novy">
          Nový návrh / protokol
        </Link>
      </div>
      {permissions.has("protocol:read") && (
        <section className="card">
          <h2>Protokoly mimo provoz a návrhy oprav</h2>
          <p>
            Vystavený dokument zde najdete i před potvrzením skutečné události.
            Závada vzniká při potvrzení odstavení, servisní případ při odeslání
            návrhu ke schválení.
          </p>
          {protocols.map((protocol) => (
            <div key={protocol.id} className="history-row">
              <Link href={`/protokoly/provozni/${protocol.id}`}>
                {protocol.number ?? "Rozpracovaný dokument"} · {protocol.title}
              </Link>
              <span>
                {protocol.items
                  .map((item) => {
                    const equipment = protocolEquipment.find(
                      (e) => e.id === item.equipmentId,
                    );
                    return equipment
                      ? `${equipment.name} · ${equipment.uid}`
                      : "Prostředek";
                  })
                  .join(", ")}
              </span>
              <span>
                {operationalProtocolProgress(
                  protocol.type,
                  protocol.status,
                  protocolEvents
                    .filter((event) => event.entityId === protocol.id)
                    .map((event) => event.action),
                )}
              </span>
              <Link href={`/protokoly/provozni/${protocol.id}`}>
                Otevřít / dokončit
              </Link>
            </div>
          ))}
          {!protocols.length && (
            <p>Zatím nejsou žádné protokoly mimo provoz ani návrhy oprav.</p>
          )}
        </section>
      )}
      <section className="card">
        <h2>Aktivní závady</h2>
        {defects.map((defect) => (
          <div key={defect.id} className="history-row">
            <Link href={`/prostredky/${defect.equipmentId}`}>
              {defect.equipment.name} · {defect.equipment.uid}
            </Link>
            <span>{defect.description}</span>
            <Link
              href={`/protokoly/novy?type=OUT_OF_SERVICE&defectId=${defect.id}`}
            >
              Protokol mimo provoz
            </Link>
            <Link
              href={`/protokoly/novy?type=REPAIR_PROPOSAL&defectId=${defect.id}`}
            >
              Návrh opravy
            </Link>
            <span>
              {defect.severity === "CRITICAL"
                ? "Kritická"
                : defect.severity === "SIGNIFICANT"
                  ? "Závažná"
                  : "Drobná"}
            </span>
          </div>
        ))}
        {!defects.length && <p>Žádné aktivní závady.</p>}
      </section>
      <section className="card">
        <h2>Servisní případy</h2>
        {repairs.map((repair) => (
          <div className="history-row" key={repair.id}>
            <Link href={`/zavady/${repair.id}`}>
              {defects.find((d) => d.id === repair.defectId)?.equipment.name ??
                "Detail opravy"}
            </Link>
            <span>{repairStates[repair.state]}</span>
            <span>
              {repair.dueAt?.toLocaleDateString("cs-CZ") ?? "Termín neurčen"}
            </span>
            {repair.dueAt &&
              repair.dueAt < new Date() &&
              !["CLOSED", "CANCELLED"].includes(repair.state) && (
                <span className="badge danger">Po termínu</span>
              )}
          </div>
        ))}
      </section>
    </ModulePage>
  );
}
