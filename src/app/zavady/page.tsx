import Link from "next/link";
import { ModulePage } from "@/components/module-page";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { repairStates } from "@/lib/operational-workflow";
import { operationalPermissions } from "@/lib/operational-authorization";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireUser();
  const permissions = await operationalPermissions(user.id);
  const defects = await prisma.defect.findMany({ where: { equipment: { organizationId: user.organizationId }, closedAt: null }, include: { equipment: true }, orderBy: { foundAt: "desc" } });
  const repairs = permissions.has("repair:manage") || permissions.has("repair:approve") ? await prisma.repairCase.findMany({ where: { organizationId: user.organizationId }, orderBy: { updatedAt: "desc" } }) : [];
  return <ModulePage eyebrow="Servis" title="Závady a opravy"><div className="row-actions"><Link className="button" href="/protokoly/novy">Nový návrh / protokol</Link></div><section className="card"><h2>Aktivní závady</h2>{defects.map(defect => <div key={defect.id} className="history-row"><Link href={`/prostredky/${defect.equipmentId}`}>{defect.equipment.name} · {defect.equipment.uid}</Link><span>{defect.description}</span><span>{defect.severity === "CRITICAL" ? "Kritická" : defect.severity === "SIGNIFICANT" ? "Závažná" : "Drobná"}</span></div>)}{!defects.length && <p>Žádné aktivní závady.</p>}</section><section className="card"><h2>Servisní případy</h2>{repairs.map(repair => <div className="history-row" key={repair.id}><Link href={`/zavady/${repair.id}`}>{defects.find(d => d.id === repair.defectId)?.equipment.name ?? "Detail opravy"}</Link><span>{repairStates[repair.state]}</span><span>{repair.dueAt?.toLocaleDateString("cs-CZ") ?? "Termín neurčen"}</span>{repair.dueAt && repair.dueAt < new Date() && !["CLOSED", "CANCELLED"].includes(repair.state) && <span className="badge danger">Po termínu</span>}</div>)}</section></ModulePage>;
}
