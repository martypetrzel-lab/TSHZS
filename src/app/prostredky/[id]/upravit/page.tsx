import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { updateEquipmentReview } from "@/app/actions/equipment-review";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ chyba?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { chyba } = await searchParams;
  const [item, categories, locations] = await Promise.all([
    prisma.equipmentItem.findUnique({
      where: { id },
      include: { requirements: true },
    }),
    prisma.equipmentCategory.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
    }),
    prisma.location.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!item) notFound();
  return (
    <AppShell userName={user.displayName}>
      <div className="content">
        <div className="page-head">
          <div>
            <p className="eyebrow">Doplnění evidence</p>
            <h1>{item.name}</h1>
          </div>
        </div>
        {chyba && <div className="error">{chyba}</div>}
        <form action={updateEquipmentReview} className="card form-card">
          <input type="hidden" name="equipmentId" value={item.id} />
          <div className="form-grid">
            <div className="field full">
              <label>Název</label>
              <input name="name" required defaultValue={item.name} />
            </div>
            <div className="field">
              <label>Kategorie</label>
              <select name="categoryId" defaultValue={item.categoryId}>
                {categories.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Umístění</label>
              <select name="locationId" defaultValue={item.locationId ?? ""}>
                <option value="">Ponechat vozidlo / neurčeno</option>
                {locations.map((l) => (
                  <option value={l.id} key={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            {[
              ["Výrobce", "manufacturer", item.manufacturer],
              ["Model", "model", item.model],
              ["Výrobní číslo", "serialNumber", item.serialNumber],
              [
                "Evidenční číslo",
                "registrationNumber",
                item.registrationNumber,
              ],
            ].map(([label, name, value]) => (
              <div className="field" key={name}>
                <label>{label}</label>
                <input name={String(name)} defaultValue={value ?? ""} />
              </div>
            ))}
          </div>
          <h2 id="povinnosti">Povinnosti</h2>
          {item.requirements.map((r) => (
            <fieldset className="requirement-edit" key={r.id}>
              <legend>{r.name}</legend>
              <div className="form-grid">
                <div className="field">
                  <label>Typ</label>
                  <select name={`type-${r.id}`} defaultValue={r.type}>
                    <option value="INSPECTION">Kontrola</option>
                    <option value="REVISION">Revize</option>
                    <option value="CALIBRATION">Kalibrace</option>
                    <option value="VERIFICATION">Ověření</option>
                  </select>
                </div>
                <div className="field">
                  <label>Interval</label>
                  <div className="inline-fields">
                    <input
                      type="number"
                      min="1"
                      name={`intervalValue-${r.id}`}
                      defaultValue={r.intervalValue ?? ""}
                    />
                    <select
                      name={`intervalUnit-${r.id}`}
                      defaultValue={r.intervalUnit ?? "MONTHS"}
                    >
                      <option value="DAYS">dní</option>
                      <option value="WEEKS">týdnů</option>
                      <option value="MONTHS">měsíců</option>
                      <option value="YEARS">let</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Další termín</label>
                  <input
                    type="date"
                    name={`nextDueAt-${r.id}`}
                    defaultValue={r.nextDueAt?.toISOString().slice(0, 10) ?? ""}
                  />
                </div>
              </div>
            </fieldset>
          ))}
          <div className="form-actions">
            <button className="button">Uložit doplnění</button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
