"use client";
import { useState } from "react";
import { OperationalActionForm } from "@/components/operational-action-form";
import { saveOperationalDraft } from "@/app/actions/operational-protocols";
import { operationalLabels, handoverPurposes } from "@/lib/operational-fields";
import { protocolTypes } from "@/lib/operational-workflow";
type Equipment = {
  id: string;
  name: string;
  uid: string;
  serialNumber: string | null;
  registrationNumber: string | null;
  legacyId: string | null;
  manufacturer: string | null;
  model: string | null;
  quantity: number;
  vehicle: string;
  location: string;
  activeHandover: boolean;
};
type Option = { id: string; name: string };
export function OperationalEditor({
  equipment,
  users,
  suppliers,
  vehicles,
  locations,
  initial,
  docId,
  initialType,
  date,
  selectedIds,
  itemDetails = {},
}: {
  equipment: Equipment[];
  users: Option[];
  suppliers: (Option & {
    contactName: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
  })[];
  vehicles: Option[];
  locations: Option[];
  initial: Record<string, string>;
  docId?: string;
  initialType: string;
  date: string;
  selectedIds: string[];
  itemDetails?: Record<string, Record<string, string>>;
}) {
  const [type, setType] = useState(initialType),
    [selected, setSelected] = useState(selectedIds),
    [query, setQuery] = useState("");
  const [recipient, setRecipient] = useState({
    recipient: initial.recipient ?? "",
    recipientOrganization: initial.recipientOrganization ?? "",
    recipientAddress: initial.recipientAddress ?? "",
    recipientPhone: initial.recipientPhone ?? "",
    recipientEmail: initial.recipientEmail ?? "",
  });
  const visible = equipment.filter((e) =>
    `${e.name} ${e.uid} ${e.serialNumber} ${e.registrationNumber} ${e.legacyId} ${e.vehicle}`
      .toLocaleLowerCase("cs")
      .includes(query.toLocaleLowerCase("cs")),
  );
  const fields = Object.entries(operationalLabels).filter(
    ([key]) =>
      ![
        "supplierId",
        "responsibleUserId",
        "targetVehicleId",
        "targetLocationId",
        "handoverPurpose",
        "relatedInspectionId",
        "relatedDefectId",
        "relatedProtocolId",
        "repairCaseId",
      ].includes(key),
  );
  return (
    <OperationalActionForm action={saveOperationalDraft}>
      {docId && <input type="hidden" name="id" value={docId} />}
      <label className="field">
        Druh dokumentu
        <select
          name="type"
          value={type}
          onChange={(event) => {
            setType(event.target.value);
            if (event.target.value !== "HANDOVER")
              setSelected(selected.slice(0, 1));
          }}
          disabled={Boolean(docId)}
        >
          {Object.entries(protocolTypes).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        {docId && <input type="hidden" name="type" value={type} />}
      </label>
      <label className="field">
        Datum protokolu
        <input type="date" name="protocolDate" defaultValue={date} required />
      </label>
      <label className="field">
        Plánované datum události
        <input
          type="date"
          name="eventPlannedAt"
          defaultValue={initial.eventPlannedAt}
        />
      </label>
      <label className="field">
        Datum skutečné události
        <input
          type="date"
          name="eventOccurredAt"
          defaultValue={initial.eventOccurredAt}
        />
      </label>
      <h2>Technické prostředky</h2>
      <label className="field">
        Vyhledat název, UID, číslo nebo vozidlo
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div style={{ maxHeight: 260, overflow: "auto" }}>
        {visible.map((e) => (
          <label className="confirm-check" key={e.id}>
            <input
              type={type === "HANDOVER" ? "checkbox" : "radio"}
              name="equipmentId"
              value={e.id}
              checked={selected.includes(e.id)}
              onChange={(event) =>
                setSelected(
                  type === "HANDOVER"
                    ? event.target.checked
                      ? [...selected, e.id]
                      : selected.filter((id) => id !== e.id)
                    : [e.id],
                )
              }
            />
            {e.name} · {e.uid} · {e.vehicle || e.location}
            {e.activeHandover && " · Již předáno"}
          </label>
        ))}
      </div>
      {equipment
        .filter((e) => selected.includes(e.id))
        .map((e) => (
          <section key={e.id} className="card">
            <h3>
              {e.name} · {e.uid}
            </h3>
            <p>
              Výrobce: {e.manufacturer ?? "—"} · Model: {e.model ?? "—"} ·
              Výrobní číslo: {e.serialNumber ?? "—"}
            </p>
            {e.activeHandover && (
              <p className="error">
                Prostředek je v aktivním předání. Další předání nelze potvrdit,
                dokud nebude vrácen.
              </p>
            )}
            <label className="field">
              Počet kusů
              <input
                type="number"
                name={`quantity-${e.id}`}
                min="1"
                max={e.quantity}
                defaultValue={itemDetails[e.id]?.quantity || "1"}
                required
              />
            </label>
            {["condition", "accessories", "description", "note"].map((key) => (
              <label className="field" key={key}>
                {operationalLabels[key]}
                <input
                  name={`${key}-${e.id}`}
                  defaultValue={itemDetails[e.id]?.[key] ?? ""}
                />
              </label>
            ))}
          </section>
        ))}
      {type === "HANDOVER" && (
        <label className="field">
          Účel předání
          <select
            name="handoverPurpose"
            defaultValue={initial.handoverPurpose || "SERVICE"}
          >
            {Object.entries(handoverPurposes).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        Servisní organizace
        <select
          name="supplierId"
          defaultValue={initial.supplierId ?? ""}
          onChange={(event) => {
            const s = suppliers.find((s) => s.id === event.target.value);
            if (s)
              setRecipient({
                recipient: s.contactName ?? "",
                recipientOrganization: s.name,
                recipientAddress: s.address ?? "",
                recipientPhone: s.phone ?? "",
                recipientEmail: s.email ?? "",
              });
          }}
        >
          <option value="">Vyberte nebo zadejte externí kontakt níže</option>
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
          defaultValue={initial.responsibleUserId ?? ""}
        >
          <option value="">Zpracovatel dokumentu</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Interní příjemce (nepovinné)
        <select
          name="recipientUserId"
          defaultValue={initial.recipientUserId ?? ""}
        >
          <option value="">Externí osoba / ruční údaje</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Cílové vozidlo
        <select
          name="targetVehicleId"
          defaultValue={initial.targetVehicleId ?? ""}
        >
          <option value="">Beze změny</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Cílové umístění
        <select
          name="targetLocationId"
          defaultValue={initial.targetLocationId ?? ""}
        >
          <option value="">Beze změny / externí servis dle příjemce</option>
          {locations.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      {fields.map(([key, label]) => {
        if (key in recipient)
          return (
            <label className="field" key={key}>
              {label}
              <input
                name={key}
                value={recipient[key as keyof typeof recipient]}
                onChange={(event) =>
                  setRecipient({ ...recipient, [key]: event.target.value })
                }
              />
            </label>
          );
        return (
          <label className="field" key={key}>
            {label}
            {key === "severity" ? (
              <select name={key} defaultValue={initial[key] || "SIGNIFICANT"}>
                <option value="MINOR">Drobná</option>
                <option value="SIGNIFICANT">Závažná</option>
                <option value="CRITICAL">Kritická</option>
              </select>
            ) : [
                "description",
                "solution",
                "justification",
                "note",
                "measures",
              ].includes(key) ? (
              <textarea name={key} defaultValue={initial[key]} />
            ) : (
              <input
                name={key}
                required={key === "reason"}
                type={
                  ["expectedReturn", "dueDate", "foundDate"].includes(key)
                    ? "date"
                    : key === "estimatedCost"
                      ? "number"
                      : "text"
                }
                step={key === "estimatedCost" ? "0.01" : undefined}
                min={key === "estimatedCost" ? "0" : undefined}
                defaultValue={
                  initial[key] ??
                  (key === "currency"
                    ? "CZK"
                    : key === "priority"
                      ? "Běžná"
                      : "")
                }
              />
            )}
          </label>
        );
      })}
      {[
        "relatedInspectionId",
        "relatedDefectId",
        "relatedProtocolId",
        "repairCaseId",
      ].map((key) => (
        <input type="hidden" key={key} name={key} value={initial[key] ?? ""} />
      ))}
      <div className="inspection-sticky">
        <button className="button" disabled={!selected.length}>
          Uložit rozpracované
        </button>
      </div>
    </OperationalActionForm>
  );
}
