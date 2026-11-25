import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { operationalPermissions } from "@/lib/operational-authorization";
import { prisma } from "@/lib/prisma";
export async function OperationalOverview() {
  const user = await requireUser(),
    permissions = await operationalPermissions(user.id);
  if (!permissions.has("protocol:read") && !permissions.has("repair:manage"))
    return null;
  const org = user.organizationId,
    now = new Date(),
    month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const statuses = await prisma.equipmentItem.groupBy({
    by: ["status"],
    where: { organizationId: org, archivedAt: null },
    _count: true,
  });
  const [pending, overdueRepairs, overdueReturns, afterRepair, documents] =
    await Promise.all([
      prisma.repairCase.count({
        where: { organizationId: org, state: "PENDING_APPROVAL" },
      }),
      prisma.repairCase.count({
        where: {
          organizationId: org,
          state: { notIn: ["CLOSED", "CANCELLED", "REJECTED"] },
          dueAt: { lt: now },
        },
      }),
      prisma.handoverMovement.count({
        where: {
          returnedAt: null,
          expectedReturnAt: { lt: now },
          item: { protocol: { organizationId: org } },
        },
      }),
      prisma.repairCase.count({
        where: { organizationId: org, state: "AWAITING_INSPECTION" },
      }),
      prisma.operationalProtocol.count({
        where: {
          organizationId: org,
          issuedAt: { gte: month },
          status: "ISSUED",
        },
      }),
    ]);
  const cost = permissions.has("repair:costs_read")
    ? await prisma.repairCase.groupBy({
        by: ["currency"],
        where: {
          organizationId: org,
          invoiceDate: { gte: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)) },
        },
        _sum: { actualCost: true },
      })
    : [];
  return (
    <>
      <section className="grid-stats">
        {[
          [
            "V provozu",
            statuses.find((s) => s.status === "IN_SERVICE")?._count ?? 0,
            "/prostredky?status=IN_SERVICE",
          ],
          [
            "Mimo provoz",
            statuses.find((s) => s.status === "OUT_OF_SERVICE")?._count ?? 0,
            "/prostredky?status=OUT_OF_SERVICE",
          ],
          [
            "V opravě",
            statuses.find((s) => s.status === "IN_REPAIR")?._count ?? 0,
            "/prostredky?status=IN_REPAIR",
          ],
          [
            "Zapůjčeno",
            statuses.find((s) => s.status === "LOANED")?._count ?? 0,
            "/prostredky?status=LOANED",
          ],
          ["Čeká na schválení", pending, "/zavady?stav=PENDING_APPROVAL"],
          ["Opravy po termínu", overdueRepairs, "/zavady?poTerminu=1"],
          [
            "Vrácení po termínu",
            overdueReturns,
            "/protokoly?predani=po-terminu&rok=vse",
          ],
          [
            "Čeká na kontrolu po opravě",
            afterRepair,
            "/zavady?stav=AWAITING_INSPECTION",
          ],
          ["Protokoly tento měsíc", documents, "/protokoly"],
          ...cost.map((c) => [
            `Náklady oprav letos (${c.currency})`,
            c._sum.actualCost?.toFixed(2) ?? "0",
            "/zavady/statistiky",
          ]),
        ].map(([label, count, href]) => (
          <Link className="card stat" key={String(label)} href={String(href)}>
            <span>{label}</span>
            <strong>{count}</strong>
          </Link>
        ))}
      </section>
      <section className="card">
        <h2>Nejdůležitější úkoly</h2>
        <div className="row-actions">
          <Link href="/zavady?kriticke=1">Kritické závady</Link>
          <Link href="/zavady?poTerminu=1">Opravy po termínu</Link>
          <Link href="/protokoly?predani=po-terminu&rok=vse">
            Nevrácené prostředky
          </Link>
          <Link href="/zavady?stav=PENDING_APPROVAL">
            Návrhy čekající na schválení
          </Link>
        </div>
        <h2>Rychlé akce</h2>
        <div className="row-actions">
          <Link href="/kontroly/provest">Provést kontrolu</Link>
          <Link href="/protokoly/novy?type=HANDOVER">Nové předání</Link>
          <Link href="/protokoly/novy?type=OUT_OF_SERVICE">
            Odstavit prostředek
          </Link>
          <Link href="/protokoly/novy?type=REPAIR_PROPOSAL">
            Nový návrh na opravu
          </Link>
          <Link href="/protokoly?predani=aktivni&rok=vse">
            Zaznamenat vrácení
          </Link>
        </div>
      </section>
    </>
  );
}
