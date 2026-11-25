import Link from "next/link";
import { ModulePage } from "@/components/module-page";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { repairStates } from "@/lib/operational-workflow";
import { operationalPermissions } from "@/lib/operational-authorization";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  const permissions = await operationalPermissions(user.id);
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
