import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { OperationalActionForm as Form } from "@/components/operational-action-form";
import { OperationalAttachments } from "@/components/operational-attachments";
import {
  saveRepairCosts,
  updateRepairDetails,
  closeRepairedDefect,
  returnEquipmentToService,
} from "@/app/actions/repair-management";
export async function RepairManagementPanel({
  id,
  organizationId,
  permissions,
}: {
  id: string;
  organizationId: string;
  permissions: Set<string>;
}) {
  const repair = await prisma.repairCase.findFirstOrThrow({
    where: { id, organizationId },
  });
  const [suppliers, users, inspections] = await Promise.all([
    prisma.serviceSupplier.findMany({
      where: { organizationId, archivedAt: null },
    }),
    prisma.user.findMany({ where: { organizationId, active: true } }),
    prisma.inspection.findMany({
      where: {
        equipmentId: repair.equipmentId,
        state: "CLOSED",
        result: { in: ["PASSED", "PASSED_WITH_LIMITATION"] },
      },
      orderBy: { completedAt: "desc" },
      include: { protocol: true },
    }),
  ]);
  const hidden = <input type="hidden" name="repairCaseId" value={id} />;
  return (
    <>
      <div className="row-actions">
        <Link href={`/protokoly/novy?type=HANDOVER&repairCaseId=${id}`}>
          Připravit předávací protokol
        </Link>
        <Link
          href={`/kontroly/provest?hledat=${encodeURIComponent((await prisma.equipmentItem.findUniqueOrThrow({ where: { id: repair.equipmentId } })).uid)}`}
        >
          Provést kontrolu po opravě
        </Link>
      </div>
      {permissions.has("repair:manage") && repair.state !== "CLOSED" && (
        <Form action={updateRepairDetails}>
          {hidden}
          <h2>Organizace opravy a termín</h2>
          <label className="field">
            Dodavatel
            <select name="supplierId" defaultValue={repair.supplierId ?? ""}>
              <option value="">Nevybrán</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Odpovědná osoba
            <select
              name="responsibleUserId"
              defaultValue={repair.responsibleUserId}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Termín opravy
            <input
              type="date"
              name="dueAt"
              defaultValue={repair.dueAt?.toISOString().slice(0, 10)}
            />
          </label>
          <label className="field">
            Číslo objednávky
            <input name="orderNumber" defaultValue={repair.orderNumber ?? ""} />
          </label>
          <label className="field">
            Důvod změny
            <input name="reason" required />
          </label>
          <button className="button">Uložit údaje opravy</button>
        </Form>
      )}
      {permissions.has("repair:costs_read") && (
        <section className="card">
          <h2>Náklady</h2>
          <p>
            Odhad: {repair.estimatedCost?.toFixed(2) ?? "—"} · Schválený limit:{" "}
            {repair.approvedLimit?.toFixed(2) ?? "—"} · Skutečnost:{" "}
            {repair.actualCost?.toFixed(2) ?? "—"} {repair.currency}
          </p>
          {repair.actualCost &&
            repair.approvedLimit &&
            repair.actualCost.gt(repair.approvedLimit) && (
              <p className="error">
                Schválený limit je překročen. Před dokončením vyžádejte
                dodatečné schválení novou verzí návrhu.
              </p>
            )}
        </section>
      )}
      {permissions.has("repair:costs_edit") && repair.state !== "CLOSED" && (
        <Form action={saveRepairCosts}>
          {hidden}
          <h2>Evidence skutečných nákladů</h2>
          {[
            ["laborCost", "Práce"],
            ["partsCost", "Náhradní díly"],
            ["transportCost", "Doprava"],
            ["otherCost", "Ostatní náklady"],
          ].map(([key, label]) => (
            <label className="field" key={key}>
              {label}
              <input
                name={key}
                type="number"
                min="0"
                step="0.01"
                defaultValue={repair[key as "laborCost"]?.toFixed(2) ?? "0.00"}
              />
            </label>
          ))}
          <label className="field">
            Měna
            <input name="currency" defaultValue={repair.currency} required />
          </label>
          <label className="field">
            Sazba DPH (%)
            <input
              name="vatRate"
              type="number"
              min="0"
              max="100"
              step="0.01"
              defaultValue={repair.vatRate?.toFixed(2) ?? ""}
            />
          </label>
          <label className="field">
            Číslo faktury
            <input
              name="invoiceNumber"
              defaultValue={repair.invoiceNumber ?? ""}
            />
          </label>
          <label className="field">
            Datum faktury
            <input
              type="date"
              name="invoiceDate"
              defaultValue={repair.invoiceDate?.toISOString().slice(0, 10)}
            />
          </label>
          <button className="button">Uložit náklady</button>
        </Form>
      )}
      <OperationalAttachments
        ownerType="RepairCase"
        ownerId={id}
        canUpload={permissions.has("repair:manage")}
      />
      {permissions.has("repair:manage") &&
        [
          "REPAIR_COMPLETED",
          "AWAITING_COLLECTION",
          "AWAITING_INSPECTION",
        ].includes(repair.state) && (
          <Form action={closeRepairedDefect}>
            {hidden}
            <h2>Potvrzení odstranění závady</h2>
            <label className="field">
              Způsob odstranění
              <textarea name="reason" required />
            </label>
            <p>
              Vyžaduje přiloženou servisní zprávu. Samotné odstranění závady
              nevrací prostředek do provozu.
            </p>
            <button className="button">Zaznamenat odstranění závady</button>
          </Form>
        )}
      {permissions.has("equipment:return_to_service") &&
        repair.state === "AWAITING_INSPECTION" && (
          <Form
            action={returnEquipmentToService}
            confirmation="Potvrdit odborné ověření všech podmínek a návrat prostředku do provozu?"
          >
            {hidden}
            <h2>Uvést zpět do provozu</h2>
            <label className="field">
              Kontrola po opravě
              <select name="inspectionId" required>
                <option value="">Vyberte kontrolu</option>
                {inspections.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.protocol?.number ?? "Kontrola"} ·{" "}
                    {i.completedAt?.toLocaleDateString("cs-CZ")}
                  </option>
                ))}
              </select>
            </label>
            <p>
              Systém znovu ověří závady, termíny, odborná oprávnění, servisní
              zprávu a aktivní předání.
            </p>
            <button className="button">Uvést zpět do provozu</button>
          </Form>
        )}
    </>
  );
}
