import Link from "next/link";
import { ModulePage } from "@/components/module-page";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export default async function Page() {
  const protocols = await prisma.protocol.findMany({
    include: { equipment: true, inspection: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <ModulePage eyebrow="Dokumentace" title="Protokoly">
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
