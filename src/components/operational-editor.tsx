"use client";
import { useState } from "react";
import { OperationalActionForm } from "@/components/operational-action-form";
import { saveOperationalDraft } from "@/app/actions/operational-protocols";
import { operationalLabels, handoverPurposes } from "@/lib/operational-fields";
import {
  protocolTypes,
  type OperationalType,
} from "@/lib/operational-workflow";
import {
  operationalForms,
  operationalFormFields,
} from "@/lib/operational-form";

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
  const type = (
    Object.hasOwn(protocolTypes, initialType) ? initialType : "HANDOVER"
  ) as OperationalType;
  const definition = operationalForms[type];
  const [selected, setSelected] = useState(
    type === "HANDOVER" ? selectedIds : selectedIds.slice(0, 1),
  );
  const [query, setQuery] = useState("");
  const [recipient, setRecipient] = useState<Record<string, string>>({
    recipient: initial.recipient ?? "",
    recipientOrganization: initial.recipientOrganization ?? "",
    recipientAddress: initial.recipientAddress ?? "",
    recipientPhone: initial.recipientPhone ?? "",
    recipientEmail: initial.recipientEmail ?? "",
  });
  const fields = operationalFormFields(type);
  const visible = equipment.filter((e) =>
    `${e.name} ${e.uid} ${e.serialNumber ?? ""} ${e.registrationNumber ?? ""} ${e.legacyId ?? ""} ${e.vehicle}`
      .toLocaleLowerCase("cs")
      .includes(query.toLocaleLowerCase("cs")),
  );
  function field(key: string) {
    const label =
      definition.labels[key] ??
      operationalLabels[key] ??
      (key === "recipientUserId" ? "Interní příjemce (nepovinné)" : key);
    const selectOptions =
      key === "handoverPurpose"
        ? Object.entries(handoverPurposes).map(([id, name]) => ({ id, name }))
        : key === "severity"
          ? [
              { id: "MINOR", name: "Drobná" },
              { id: "SIGNIFICANT", name: "Závažná" },
              { id: "CRITICAL", name: "Kritická" },
            ]
          : key === "supplierId"
            ? suppliers
            : ["responsibleUserId", "recipientUserId"].includes(key)
              ? users
              : key === "targetVehicleId"
                ? vehicles
                : key === "targetLocationId"
                  ? locations
                  : null;
    const placeholder =
      key === "supplierId"
        ? "Nevybráno / externí kontakt"
        : key === "responsibleUserId"
          ? "Zpracovatel dokumentu"
          : key === "recipientUserId"
            ? "Externí osoba / ruční údaje"
            : "Beze změny";
    const defaultValue =
      initial[key] ??
      (
        {
          currency: "CZK",
          priority: "Běžná",
          severity: "SIGNIFICANT",
          handoverPurpose: "SERVICE",
        } as Record<string, string>
      )[key] ??
      "";
    return (
      <label className="field" key={key}>
        {label}
        {selectOptions ? (
          <select
            name={key}
            defaultValue={defaultValue}
            onChange={
              key === "supplierId" && type === "HANDOVER"
                ? (event) => {
                    const supplier = suppliers.find(
                      (s) => s.id === event.target.value,
                    );
                    if (supplier)
                      setRecipient({
                        recipient: supplier.contactName ?? "",
                        recipientOrganization: supplier.name,
                        recipientAddress: supplier.address ?? "",
                        recipientPhone: supplier.phone ?? "",
                        recipientEmail: supplier.email ?? "",
                      });
                  }
                : undefined
            }
          >
            {!["handoverPurpose", "severity"].includes(key) && (
              <option value="">{placeholder}</option>
            )}
            {selectOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        ) : key in recipient ? (
          <input
            name={key}
            value={recipient[key]}
            type={
              key === "recipientEmail"
                ? "email"
                : key === "recipientPhone"
                  ? "tel"
                  : "text"
            }
            onChange={(event) =>
              setRecipient({ ...recipient, [key]: event.target.value })
            }
          />
        ) : [
            "reason",
            "description",
            "solution",
            "justification",
            "note",
            "measures",
          ].includes(key) ? (
          <textarea
            name={key}
            defaultValue={defaultValue}
            required={key === "reason"}
          />
        ) : (
          <input
            name={key}
            defaultValue={defaultValue}
            type={
              [
                "expectedReturn",
                "dueDate",
                "foundDate",
                "eventPlannedAt",
                "eventOccurredAt",
              ].includes(key)
                ? "date"
                : key === "estimatedCost"
                  ? "number"
                  : "text"
            }
            step={key === "estimatedCost" ? "0.01" : undefined}
            min={key === "estimatedCost" ? "0" : undefined}
          />
        )}
      </label>
    );
  }
  return (
    <OperationalActionForm action={saveOperationalDraft}>
      <div className="operational-document-form">
        {docId && <input type="hidden" name="id" value={docId} />}
        <input type="hidden" name="type" value={type} />
        <p>{definition.description}</p>
        <p>
          Ukládá a tiskne se jako samostatný dokument:{" "}
          <strong>{protocolTypes[type]}</strong>.
        </p>
        <label className="field">
          {type === "REPAIR_PROPOSAL" ? "Datum návrhu" : "Datum protokolu"}
          <input type="date" name="protocolDate" defaultValue={date} required />
        </label>
        <section className="operational-form-section">
          <h2>
            {type === "HANDOVER"
              ? "Předávané prostředky"
              : "Technický prostředek"}
          </h2>
          <p>
            {type === "HANDOVER"
              ? "Vyberte jeden nebo více prostředků k předání."
              : "Vyberte jeden prostředek, kterého se tento dokument týká."}
          </p>
          <label className="field">
            Vyhledat název, UID, číslo nebo vozidlo
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div style={{ maxHeight: 260, overflow: "auto" }}>
            {!visible.length && <p>Žádný prostředek neodpovídá hledání.</p>}
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
          {/* Search must not remove selected equipment from the submitted document. */}
          {selected
            .filter((id) => !visible.some((e) => e.id === id))
            .map((id) => (
              <input key={id} type="hidden" name="equipmentId" value={id} />
            ))}
          {equipment
            .filter((e) => selected.includes(e.id))
            .map((e) => (
              <section key={e.id} className="card">
                <h3>
                  {e.name} · {e.uid}
                </h3>
                <p>
                  Výrobce: {e.manufacturer ?? "—"} · Model: {e.model ?? "—"} ·
                  Výrobní číslo: {e.serialNumber ?? "—"} · Evidenční číslo:{" "}
                  {e.registrationNumber ?? "—"}
                </p>
                {type === "HANDOVER" && e.activeHandover && (
                  <p className="error">
                    Prostředek je v aktivním předání. Další předání nelze
                    potvrdit, dokud nebude vrácen.
                  </p>
                )}
                {type === "HANDOVER" ? (
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
                ) : (
                  <input
                    type="hidden"
                    name={`quantity-${e.id}`}
                    value={itemDetails[e.id]?.quantity || "1"}
                  />
                )}
                {definition.itemFields.map((key) => (
                  <label className="field" key={key}>
                    {operationalLabels[key]}
                    <input
                      name={`${key}-${e.id}`}
                      defaultValue={itemDetails[e.id]?.[key] ?? ""}
                    />
                  </label>
                ))}
                {["condition", "accessories", "description", "note"]
                  .filter((key) => !definition.itemFields.includes(key))
                  .map((key) => (
                    <input
                      type="hidden"
                      key={key}
                      name={`${key}-${e.id}`}
                      value={docId ? (itemDetails[e.id]?.[key] ?? "") : ""}
                    />
                  ))}
              </section>
            ))}
        </section>
        {definition.sections.map((section) => (
          <section className="operational-form-section" key={section.title}>
            <h2>{section.title}</h2>
            {section.fields.map(field)}
          </section>
        ))}
        {Object.keys(operationalLabels)
          .concat(["recipientUserId", "eventPlannedAt", "eventOccurredAt"])
          .filter((key) => !fields.includes(key))
          .map((key) => (
            <input
              type="hidden"
              key={key}
              name={key}
              value={
                key.startsWith("related") || key === "repairCaseId" || docId
                  ? (initial[key] ?? "")
                  : ""
              }
            />
          ))}
        <div className="inspection-sticky">
          <button className="button" disabled={!selected.length}>
            Uložit: {protocolTypes[type]}
          </button>
        </div>
      </div>
    </OperationalActionForm>
  );
}
