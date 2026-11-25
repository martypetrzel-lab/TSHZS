import { prisma } from "@/lib/prisma";
import { todayDateKey } from "@/lib/inspection-lifecycle";
import { OperationalActionForm } from "@/components/operational-action-form";
import { returnHandoverItem } from "@/app/actions/operational-protocols";
export async function ReturnHandoverForm({
  organizationId,
  movementId,
  name,
}: {
  organizationId: string;
  movementId: string;
  name: string;
}) {
  const [locations, vehicles] = await Promise.all([
    prisma.location.findMany({
      where: { station: { organizationId }, archivedAt: null },
    }),
    prisma.vehicle.findMany({
      where: { station: { organizationId }, archivedAt: null },
    }),
  ]);
  return (
    <OperationalActionForm action={returnHandoverItem}>
      <h2>Zaznamenat vrácení: {name}</h2>
      <input type="hidden" name="movementId" value={movementId} />
      <label className="field">
        Datum vrácení
        <input
          type="date"
          name="returnedAt"
          required
          defaultValue={todayDateKey()}
        />
      </label>
      {[
        ["condition", "Stav prostředku"],
        ["accessories", "Úplnost příslušenství"],
        ["defects", "Zjištěné závady"],
        ["note", "Poznámka"],
      ].map(([key, label]) => (
        <label className="field" key={key}>
          {label}
          <textarea name={key} required={key === "condition"} />
        </label>
      ))}
      <label className="field">
        Nové umístění
        <select name="locationId">
          <option value="">Beze změny</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Nové vozidlo
        <select name="vehicleId">
          <option value="">Bez přiřazení / beze změny</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <p>
        Po vrácení prostředek čeká na kontrolu. Servisní zprávu nahrajte do
        souvisejícího servisního případu.
      </p>
      <button className="button">Zaznamenat vrácení</button>
    </OperationalActionForm>
  );
}
