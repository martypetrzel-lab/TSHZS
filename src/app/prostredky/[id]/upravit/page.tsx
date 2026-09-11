import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { updateEquipmentReview } from "@/app/actions/equipment-review";
import { requireEquipmentEditor } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
const statusOptions = [
  ["IN_SERVICE", "V provozu"],
  ["OUT_OF_SERVICE", "Mimo provoz"],
  ["IN_REPAIR", "V opravě"],
  ["AWAITING_INSPECTION", "Čeká na kontrolu"],
  ["AWAITING_REVISION", "Čeká na revizi"],
  ["LOANED", "Zapůjčeno"],
  ["IN_STOCK", "Sklad"],
  ["RETIRED", "Vyřazeno"],
  ["LOST", "Ztraceno"],
  ["WINTERIZED", "Zazimováno"],
] as const;
const typeOptions = [
  ["INSPECTION", "Kontrola"],
  ["REVISION", "Revize"],
  ["CALIBRATION", "Kalibrace"],
  ["VERIFICATION", "Ověření"],
  ["LIFETIME", "Životnost"],
  ["EXPIRATION", "Expirace"],
] as const;
const dateValue = (date: Date | null) => date?.toISOString().slice(0, 10) ?? "";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ chyba?: string }>;
}) {
  const user = await requireEquipmentEditor();
  const { id } = await params;
  const { chyba } = await searchParams;
  const [item, categories, locations, vehicles, users] = await Promise.all([
    prisma.equipmentItem.findUnique({
      where: { id },
      include: {
        requirements: {
          where: { archivedAt: null },
          include: { _count: { select: { history: true } } },
        },
        category: true,
        vehicle: true,
        location: true,
      },
    }),
    prisma.equipmentCategory.findMany({
      where: { archivedAt: null },
      orderBy: [{ parentId: "asc" }, { name: "asc" }],
    }),
    prisma.location.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
    }),
    prisma.vehicle.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { active: true, organizationId: user.organizationId },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    }),
  ]);
  if (!item) notFound();
  const placement = item.vehicleId
    ? `vehicle:${item.vehicleId}`
    : item.locationId
      ? `location:${item.locationId}`
      : "none";
  return (
    <AppShell userName={user.displayName}>
      <div className="content">
        <div className="page-head">
          <div>
            <p className="eyebrow">Editace prostředku</p>
            <h1>{item.name}</h1>
            <p className="muted">UID {item.uid} se běžnou editací nemění.</p>
          </div>
          <Link className="button secondary" href={`/prostredky/${item.id}`}>
            Zpět na detail
          </Link>
        </div>
        {chyba && <div className="error">{chyba}</div>}
        <form action={updateEquipmentReview} className="equipment-editor">
          <input type="hidden" name="equipmentId" value={item.id} />
          <section className="card edit-section">
            <h2>A) Identifikace</h2>
            <div className="form-grid">
              <div className="field">
                <label>UID</label>
                <input value={item.uid} readOnly />
              </div>
              <div className="field">
                <label>Název prostředku</label>
                <input name="name" required defaultValue={item.name} />
              </div>
              <div className="field">
                <label>Původní ID / Legacy ID</label>
                <input name="legacyId" defaultValue={item.legacyId ?? ""} />
              </div>
              <div className="field">
                <label>Původní identifikační číslo karty</label>
                <input
                  name="legacyIdentificationNumber"
                  defaultValue={item.legacyIdentificationNumber ?? ""}
                />
              </div>
              <div className="field">
                <label>Evidenční číslo</label>
                <input
                  name="registrationNumber"
                  defaultValue={item.registrationNumber ?? ""}
                />
              </div>
              <div className="field">
                <label>Výrobní číslo</label>
                <input
                  name="serialNumber"
                  defaultValue={item.serialNumber ?? ""}
                />
              </div>
              <div className="field">
                <label>Výrobce</label>
                <input
                  name="manufacturer"
                  defaultValue={item.manufacturer ?? ""}
                />
              </div>
              <div className="field">
                <label>Model / typ výrobce</label>
                <input name="model" defaultValue={item.model ?? ""} />
              </div>
              <div className="field">
                <label>Typ prostředku</label>
                <input name="typeName" defaultValue={item.typeName ?? ""} />
              </div>
              <div className="field">
                <label>Materiál</label>
                <input name="material" defaultValue={item.material ?? ""} />
              </div>
              <div className="field">
                <label>Osobní přidělení</label>
                <select
                  name="assignedUserId"
                  defaultValue={item.assignedUserId ?? ""}
                >
                  <option value="">Bez přiřazení</option>
                  {users.map((person) => (
                    <option value={person.id} key={person.id}>
                      {person.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Původní text přidělení</label>
                <input
                  name="assignedPersonText"
                  defaultValue={item.assignedPersonText ?? ""}
                />
              </div>
              <div className="field full">
                <label>Technický popis</label>
                <textarea
                  name="technicalDescription"
                  defaultValue={item.technicalDescription ?? ""}
                />
              </div>
            </div>
          </section>
          <section className="card edit-section">
            <h2>B) Zařazení</h2>
            <div className="form-grid">
              <div className="field">
                <label>Kategorie / podkategorie</label>
                <select name="categoryId" defaultValue={item.categoryId}>
                  {categories.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.code} · {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Stav prostředku</label>
                <select name="status" defaultValue={item.status}>
                  {statusOptions.map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>
          <section className="card edit-section">
            <h2>C) Umístění</h2>
            <div className="field">
              <label>Vozidlo nebo umístění na stanici</label>
              <select name="placement" defaultValue={placement}>
                <option value="none">Neurčeno</option>
                <optgroup label="Vozidla">
                  {vehicles.map((v) => (
                    <option value={`vehicle:${v.id}`} key={v.id}>
                      {v.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Umístění na stanici">
                  {locations.map((l) => (
                    <option value={`location:${l.id}`} key={l.id}>
                      {l.name}
                    </option>
                  ))}
                </optgroup>
              </select>
              <small>
                Volba vždy nastaví pouze vozidlo, nebo pouze umístění.
              </small>
            </div>
          </section>
          <section className="card edit-section">
            <h2>D) Data</h2>
            <div className="form-grid">
              {[
                ["Datum výroby", "manufacturedAt", item.manufacturedAt],
                [
                  "Datum zavedení do evidence",
                  "registeredAt",
                  item.registeredAt,
                ],
                ["Datum pořízení", "acquiredAt", item.acquiredAt],
                ["Konec záruky", "warrantyUntil", item.warrantyUntil],
                ["Konec životnosti", "lifetimeUntil", item.lifetimeUntil],
              ].map(([label, name, value]) => (
                <div className="field" key={String(name)}>
                  <label>{String(label)}</label>
                  <input
                    type="date"
                    name={String(name)}
                    defaultValue={dateValue(value as Date | null)}
                  />
                </div>
              ))}
            </div>
          </section>
          <section className="card edit-section">
            <h2>E) Poznámka</h2>
            <div className="field">
              <textarea name="note" defaultValue={item.note ?? ""} />
            </div>
          </section>
          {item.importedAt && (
            <section className="card edit-section imported-data">
              <h2>F) Importovaná data</h2>
              <dl>
                <dt>Zdroj</dt>
                <dd>Původní XLSX evidence</dd>
                <dt>Datum importu</dt>
                <dd>{item.importedAt.toLocaleDateString("cs-CZ")}</dd>
                <dt>Původní ID</dt>
                <dd>{item.legacyId ?? "—"}</dd>
                <dt>Původní PROT reference</dt>
                <dd>{item.legacyProtocolReference ?? "—"}</dd>
                <dt>Vyžaduje doplnění</dt>
                <dd>{item.needsReview ? "Ano" : "Ne"}</dd>
              </dl>
            </section>
          )}
          <section className="card edit-section" id="povinnosti">
            <div className="section-head">
              <h2>G) Povinnosti</h2>
              <span>Každá povinnost má vlastní termíny a historii.</span>
            </div>
            {item.requirements.map((r) => (
              <fieldset className="requirement-edit" key={r.id}>
                <legend>{r.name}</legend>
                <div className="form-grid">
                  <div className="field">
                    <label>Název povinnosti</label>
                    <input name={`name-${r.id}`} defaultValue={r.name} />
                  </div>
                  <div className="field">
                    <label>Typ</label>
                    <select name={`type-${r.id}`} defaultValue={r.type}>
                      {typeOptions.map(([v, l]) => (
                        <option value={v} key={v}>
                          {l}
                        </option>
                      ))}
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
                        <option value="OPERATING_HOURS">motohodin</option>
                        <option value="USAGE_COUNT">použití</option>
                      </select>
                    </div>
                  </div>
                  <div className="field">
                    <label>Poslední provedení</label>
                    <input
                      type="date"
                      name={`lastCompletedAt-${r.id}`}
                      defaultValue={dateValue(r.lastCompletedAt)}
                    />
                  </div>
                  <div className="field">
                    <label>Další termín</label>
                    <input
                      type="date"
                      name={`nextDueAt-${r.id}`}
                      defaultValue={dateValue(r.nextDueAt)}
                    />
                  </div>
                  <div className="field">
                    <label>Zdroj</label>
                    <input value={r.source ?? "—"} readOnly />
                  </div>
                  <div className="field full">
                    <label>Poznámka</label>
                    <textarea
                      name={`note-${r.id}`}
                      defaultValue={r.note ?? ""}
                    />
                  </div>
                  <div className="field">
                    <label>Stav</label>
                    <input value={r.status} readOnly />
                  </div>
                  <label className="review-check">
                    <input type="checkbox" name={`archive-${r.id}`} />{" "}
                    Archivovat povinnost ({r._count.history} záznamů historie)
                  </label>
                </div>
              </fieldset>
            ))}
            <fieldset className="requirement-edit new-requirement">
              <legend>+ Přidat povinnost</legend>
              <label className="review-check">
                <input type="checkbox" name="addRequirement" /> Vytvořit tuto
                novou povinnost
              </label>
              <div className="form-grid">
                <div className="field">
                  <label>Název</label>
                  <input name="newName" />
                </div>
                <div className="field">
                  <label>Typ</label>
                  <select name="newType">
                    {typeOptions.map(([v, l]) => (
                      <option value={v} key={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Interval</label>
                  <div className="inline-fields">
                    <input type="number" min="1" name="newIntervalValue" />
                    <select name="newIntervalUnit" defaultValue="YEARS">
                      <option value="DAYS">dní</option>
                      <option value="WEEKS">týdnů</option>
                      <option value="MONTHS">měsíců</option>
                      <option value="YEARS">let</option>
                      <option value="OPERATING_HOURS">motohodin</option>
                      <option value="USAGE_COUNT">použití</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Poslední provedení</label>
                  <input type="date" name="newLastCompletedAt" />
                </div>
                <div className="field">
                  <label>Další termín</label>
                  <input type="date" name="newNextDueAt" />
                </div>
                <div className="field full">
                  <label>Poznámka</label>
                  <textarea name="newNote" />
                </div>
              </div>
            </fieldset>
          </section>
          <section className="card edit-actions">
            <label className="review-check">
              <input type="checkbox" name="reviewed" /> Údaje jsem zkontroloval
              – odstranit příznak „Vyžaduje doplnění“
            </label>
            <div>
              <button className="button secondary" name="intent" value="save">
                Uložit
              </button>
              <button className="button" name="intent" value="next">
                Uložit a otevřít další k doplnění
              </button>
            </div>
          </section>
        </form>
      </div>
    </AppShell>
  );
}
