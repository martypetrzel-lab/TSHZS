import { ModulePage } from "@/components/module-page";
import { OperationalActionForm as Form } from "@/components/operational-action-form";
import { saveSupplier } from "@/app/actions/repair-management";
import { requireOperationalPermission } from "@/lib/operational-authorization";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
const fields = {
  name: "Název",
  companyId: "IČO",
  taxId: "DIČ",
  address: "Adresa",
  contactName: "Kontaktní osoba",
  phone: "Telefon",
  email: "E-mail",
  specialization: "Specializace",
  note: "Poznámka",
};
export default async function Page() {
  const user = await requireOperationalPermission("supplier:manage");
  const suppliers = await prisma.serviceSupplier.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
  });
  return (
    <ModulePage eyebrow="Technická služba" title="Servisní organizace">
      {[null, ...suppliers].map((s) => (
        <details className="card" key={s?.id ?? "new"}>
          <summary>{s?.name ?? "+ Nová organizace"}</summary>
          <Form action={saveSupplier}>
            {s && <input name="id" type="hidden" value={s.id} />}
            {Object.entries(fields).map(([key, label]) => (
              <label className="field" key={key}>
                {label}
                <input
                  name={key}
                  defaultValue={s?.[key as keyof typeof fields] ?? ""}
                  required={key === "name"}
                />
              </label>
            ))}
            <button className="button">Uložit organizaci</button>
          </Form>
        </details>
      ))}
    </ModulePage>
  );
}
