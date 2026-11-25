import Link from "next/link";
import { RepairManagementPanel } from "@/components/repair-management-panel";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { operationalPermissions } from "@/lib/operational-authorization";
import { prisma } from "@/lib/prisma";
import { ModulePage } from "@/components/module-page";
import { OperationalActionForm } from "@/components/operational-action-form";
import { advanceRepair } from "@/app/actions/operational-protocols";
import { repairStates } from "@/lib/operational-workflow";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const permissions = await operationalPermissions(user.id);
  if (!permissions.has("repair:manage") && !permissions.has("repair:approve"))
    notFound();
  const { id } = await params;
  const repair = await prisma.repairCase.findFirst({
    where: { id, organizationId: user.organizationId },
    include: { events: { orderBy: { createdAt: "desc" } }, decisions: true },
  });
  if (!repair) notFound();
  const equipment = await prisma.equipmentItem.findUnique({
    where: { id: repair.equipmentId },
  });
  const defect = await prisma.defect.findUnique({
    where: { id: repair.defectId },
  });
  return (
    <ModulePage eyebrow="Servisní případ" title={equipment?.name ?? "Oprava"}>
      <Link href={`/prostredky/${repair.equipmentId}`}>Detail prostředku</Link>
      <section className="card">
        <h2>{repairStates[repair.state]}</h2>
        <p>{defect?.description}</p>
        <p>Termín: {repair.dueAt?.toLocaleDateString("cs-CZ") ?? "Neurčen"}</p>
        {permissions.has("repair:costs_read") && (
          <p>
            Odhad: {repair.estimatedCost?.toFixed(2) ?? "—"} {repair.currency} ·
            Limit: {repair.approvedLimit?.toFixed(2) ?? "—"} · Skutečnost:{" "}
            {repair.actualCost?.toFixed(2) ?? "—"}
          </p>
        )}
      </section>
      {permissions.has("repair:manage") && (
        <OperationalActionForm action={advanceRepair}>
          <input type="hidden" name="repairCaseId" value={id} />
          <label className="field">
            Nový stav
            <select name="state">
              {Object.entries(repairStates)
                .filter(
                  ([key]) =>
                    ![
                      "APPROVED",
                      "REJECTED",
                      "CHANGES_REQUIRED",
                      "CLOSED",
                    ].includes(key),
                )
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            Poznámka
            <textarea name="note" />
          </label>
          <button className="button">Změnit stav</button>
        </OperationalActionForm>
      )}
      <RepairManagementPanel
        id={id}
        organizationId={user.organizationId}
        permissions={permissions}
      />
      <section className="card">
        <h2>Historie opravy</h2>
        {repair.events.map((event) => (
          <div key={event.id}>
            <p>
              {event.createdAt.toLocaleString("cs-CZ")} ·{" "}
              {repairStates[event.newState]} · {event.note}
            </p>
            {(event.data as { protocolId?: string } | null)?.protocolId && (
              <Link
                href={`/protokoly/provozni/${(event.data as { protocolId: string }).protocolId}`}
              >
                Související návrh
              </Link>
            )}
          </div>
        ))}
      </section>
    </ModulePage>
  );
}
