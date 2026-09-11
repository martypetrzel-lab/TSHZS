import Link from "next/link";
import { ModulePage } from "@/components/module-page";
import { intervalLabel } from "@/lib/cepro";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export default async function Page() {
  const source = await prisma.sourceDocument.findUnique({ where: { seedKey: "cepro:01-hse-01-00-2015:v6r1" }, include: { rules: { where: { active: true }, include: { versions: { where: { validTo: null }, orderBy: { version: "desc" }, take: 1 }, directRequirements: { where: { archivedAt: null }, select: { equipmentId: true } } }, orderBy: [{ targetLabel: "asc" }, { name: "asc" }] } } });
  return <ModulePage eyebrow="Interní předpis" title="Metodika HZS ČEPRO">
    {!source ? <div className="card empty-state"><strong>Metadata metodiky zatím nejsou v databázi.</strong><p className="muted">Spusťte produkční inicializaci databáze.</p></div> : <>
      <div className="card methodology-head"><div><strong>{source.title}</strong><p>{source.documentNumber}</p></div><dl><div><dt>Verze</dt><dd>{source.version}</dd></div><div><dt>Účinnost</dt><dd>{source.effectiveFrom?.toLocaleDateString("cs-CZ")}</dd></div><div><dt>Vydavatel</dt><dd>{source.issuer}</dd></div><div><dt>Typ</dt><dd>INTERNAL_CEPRO</dd></div></dl></div>
      <div className="page-actions"><Link className="button" href="/pravidla/cepro/porovnani">Porovnat s aktuální evidencí</Link></div>
      <div className="card table-wrap"><table className="table"><thead><tr><th>Typ prostředku</th><th>Povinnost</th><th>Interval / událost</th><th>Provádí</th><th>Odkaz</th><th>Dopadá na</th></tr></thead><tbody>{source.rules.map(rule => { const v=rule.versions[0]; return <tr key={rule.id}><td>{rule.targetLabel ?? "Vyžaduje doplnění"}</td><td>{rule.name}</td><td>{v ? intervalLabel(v.intervalValue,v.intervalUnit,v.trigger) : "Vyžaduje doplnění"}</td><td>{v?.performedBy ?? "Vyžaduje doplnění"}</td><td>{v?.article ?? "—"}</td><td>{new Set(rule.directRequirements.map(x=>x.equipmentId)).size}</td></tr>;})}</tbody></table></div>
    </>}
  </ModulePage>;
}
