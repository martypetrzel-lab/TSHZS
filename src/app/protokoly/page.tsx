import Link from "next/link";
import { ModulePage } from "@/components/module-page";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { protocolTypes } from "@/lib/operational-workflow";
import { operationalPermissions } from "@/lib/operational-authorization";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireUser();
  const permissions = await operationalPermissions(user.id);
  const operational = permissions.has("protocol:read") ? await prisma.operationalProtocol.findMany({ where: { organizationId: user.organizationId, status: { not: "CANCELLED" } }, orderBy: { protocolDate: "desc" }, take: 100 }) : [];
  const protocols = await prisma.protocol.findMany({
    include: { equipment: true, inspection: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <ModulePage eyebrow="Dokumentace" title="Protokoly">
      <div className="row-actions"><Link className="button" href="/protokoly/novy">+ Nový protokol</Link>{user.roles.some(r => r.role.code === "ADMIN") && <Link href="/administrace/opravneni">Správa provozních oprávnění</Link>}</div>
      {operational.length > 0 && <section className="card table-wrap"><h2>Provozní protokoly</h2><table className="table"><thead><tr><th>Datum</th><th>Číslo</th><th>Druh</th><th>Stav</th><th>Akce</th></tr></thead><tbody>{operational.map(p => <tr key={p.id}><td>{p.protocolDate.toLocaleDateString("cs-CZ")}</td><td>{p.number ?? "Dosud nepřiděleno"}</td><td>{protocolTypes[p.type]}</td><td>{p.status === "DRAFT" ? "Rozpracováno" : "Vystaveno"}</td><td><Link href={`/protokoly/provozni/${p.id}`}>Detail</Link></td></tr>)}</tbody></table></section>}
      {protocols.length ? (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Protokol</th>
                <th>Prostředek</th>
                <th>Zdroj</th>
                <th>Datum protokolu</th>
                <th>Dokument</th>
              </tr>
            </thead>
            <tbody>
              {protocols.map((p) => (
                <tr key={p.id}>
                  <td>{p.number}{p.cancelledAt && <><br /><span className="badge">STORNOVÁNO</span></>}</td>
                  <td>
                    {p.equipment ? (
                      <Link href={`/prostredky/${p.equipment.id}`}>
                        {p.equipment.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{p.legacyImported ? "Původní evidence" : "TSHZS"}</td>
                  <td>{(p.protocolDate ?? p.createdAt).toLocaleDateString("cs-CZ")}</td>
                  <td>
                    {p.inspectionId ? (
                      <span className="row-actions">
                        <Link href={`/kontroly/${p.inspectionId}`}>Detail</Link>
                        <a href={`/api/kontroly/${p.inspectionId}/pdf`}>PDF</a>
                      </span>
                    ) : p.externalUrl ? (
                      <a href={p.externalUrl} target="_blank" rel="noreferrer">
                        Otevřít původní PDF
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card empty-state">
          <strong>Zatím nejsou evidovány žádné protokoly.</strong>
        </div>
      )}
    </ModulePage>
  );
}
