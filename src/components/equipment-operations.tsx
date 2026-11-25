import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { operationalPermissions } from "@/lib/operational-authorization";
import { protocolTypes, repairStates } from "@/lib/operational-workflow";
export async function EquipmentOperations({
  equipmentId,
}: {
  equipmentId: string;
}) {
  const user = await requireUser(),
    permissions = await operationalPermissions(user.id);
  if (!permissions.has("protocol:read")) return null;
  const documents = await prisma.operationalProtocol.findMany({
    where: {
      organizationId: user.organizationId,
      items: { some: { equipmentId } },
    },
    orderBy: { createdAt: "desc" },
  });
  const repairs = permissions.has("repair:manage")
    ? await prisma.repairCase.findMany({
        where: { equipmentId, organizationId: user.organizationId },
        orderBy: { createdAt: "desc" },
      })
    : [];
  return (
    <section className="card">
      <h2>Provozní dokumentace a opravy</h2>
      {permissions.has("protocol:create") && (
        <div className="row-actions">
          {Object.entries(protocolTypes).map(([key, label]) => (
            <Link
              key={key}
              href={`/protokoly/novy?type=${key}&equipmentId=${equipmentId}`}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
      {documents.map((d) => (
        <p key={d.id}>
          <Link href={`/protokoly/provozni/${d.id}`}>
            {d.number ?? "Rozpracováno"} · {protocolTypes[d.type]}
          </Link>{" "}
          ·{" "}
          {d.status === "CANCELLED"
            ? "Stornováno"
            : d.status === "DRAFT"
              ? "Návrh"
              : "Vystaveno"}
        </p>
      ))}
      {repairs.map((r) => (
        <p key={r.id}>
          <Link href={`/zavady/${r.id}`}>Oprava · {repairStates[r.state]}</Link>
        </p>
      ))}
    </section>
  );
}
