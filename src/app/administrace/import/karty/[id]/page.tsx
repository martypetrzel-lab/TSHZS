import Link from "next/link";
import { notFound } from "next/navigation";
import { confirmEquipmentCardImport } from "@/app/actions/equipment-card-import";
import { AppShell } from "@/components/app-shell";
import { requireImportAdministrator } from "@/lib/authorization";
import type { ParsedEquipmentCard } from "@/lib/import/equipment-cards";
import { prisma } from "@/lib/prisma";
const fieldLabels: Record<string, string> = {
  name: "Název",
  legacyIdentificationNumber: "Původní identifikační číslo",
  registrationNumber: "Evidenční číslo",
  serialNumber: "Výrobní číslo",
  typeName: "Druh prostředku",
  manufacturer: "Výrobce",
  model: "Model / typ",
  material: "Materiál",
  manufacturedAt: "Datum výroby",
  commissionedAt: "Zavedení do užívání",
  vehicle: "Vozidlo",
  registrationPlate: "SPZ",
  assignedPersonText: "Přidělená osoba",
  technicalDescription: "Technický popis",
};
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ hotovo?: string }>;
}) {
  const user = await requireImportAdministrator(),
    { id } = await params,
    q = await searchParams,
    job = await prisma.importJob.findUnique({
      where: { id },
      include: { rows: { orderBy: { sheetName: "asc" } } },
    });
  if (
    !job ||
    (job.summaryJson as { kind?: string } | null)?.kind !== "EQUIPMENT_CARDS"
  )
    notFound();
  const equipment = await prisma.equipmentItem.findMany({
    where: { archivedAt: null, organizationId: user.organizationId },
    select: {
      id: true,
      uid: true,
      name: true,
      manufacturer: true,
      serialNumber: true,
    },
    orderBy: { name: "asc" },
    take: 1000,
  });
  const summary = job.summaryJson as {
    sheets: number;
    cards: number;
    ignoredSheets: number;
  };
  return (
    <AppShell userName={user.displayName}>
      <div className="content">
        <div className="page-head">
          <div>
            <p className="eyebrow">Preview importu karet</p>
            <h1>{job.fileName}</h1>
            <p className="muted">
              {summary.cards} karet · {summary.ignoredSheets} ignorovaných listů
            </p>
          </div>
          <Link className="button secondary" href="/administrace/import/karty">
            Nový import
          </Link>
        </div>
        {q.hotovo && (
          <div className="result-banner success">
            Import byl dokončen: {job.createdRows} nových, {job.updatedRows}{" "}
            spárovaných, {job.skippedRows} přeskočených karet.
          </div>
        )}
        {job.status !== "COMPLETED" && (
          <form action={confirmEquipmentCardImport}>
            <input type="hidden" name="jobId" value={job.id} />
            <div className="card-list">
              {job.rows.map((row) => {
                const preview = row.previewData as unknown as {
                    card: ParsedEquipmentCard;
                    match: {
                      status: string;
                      candidate?: { id: string; name: string };
                      reason: string;
                    };
                    conflicts: Array<{
                      field: string;
                      current: string;
                      incoming: string;
                    }>;
                  },
                  card = preview.card;
                return (
                  <section className="card passport-preview" key={row.id}>
                    <div className="section-head">
                      <div>
                        <strong>{card.sheetName}</strong>
                        <span>
                          {card.fields.name?.value ??
                            card.fields.typeName?.value ??
                            "Název vyžaduje kontrolu"}
                        </span>
                      </div>
                      <span
                        className={`badge ${preview.match.status === "EXACT" ? "" : "warn"}`}
                      >
                        {preview.match.status === "EXACT"
                          ? row.status === "ERROR"
                            ? "CHYBA"
                            : "PŘESNÁ SHODA"
                          : preview.match.status === "PROBABLE"
                            ? "PRAVDĚPODOBNÁ SHODA"
                            : preview.match.status === "NEW"
                              ? "NOVÝ PROSTŘEDEK"
                              : "VYŽADUJE ROZHODNUTÍ"}
                      </span>
                    </div>
                    <p className="muted">{preview.match.reason}</p>
                    <dl className="passport-fields">
                      {Object.entries(card.fields).map(([key, field]) => (
                        <div key={key}>
                          <dt>{fieldLabels[key] ?? key}</dt>
                          <dd>{field.value}</dd>
                        </div>
                      ))}
                    </dl>
                    {preview.conflicts.length > 0 && (
                      <div className="conflict-box">
                        <strong>Konfliktní hodnoty</strong>
                        {preview.conflicts.map((conflict) => (
                          <label key={conflict.field}>
                            <input
                              type="checkbox"
                              name={`apply-${row.id}-${conflict.field}`}
                            />
                            <span>
                              <b>
                                {fieldLabels[conflict.field] ?? conflict.field}
                              </b>
                              : web „{conflict.current}“ · XLSX „
                              {conflict.incoming}“
                              <small>Zaškrtnutím převzít hodnotu z XLSX.</small>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                    <div className="passport-counts">
                      <span>
                        {card.specifications.length} technických parametrů
                      </span>
                      <span>{card.logEntries.length} záznamů deníku</span>
                      {card.unknownRows.length > 0 && (
                        <span>
                          {card.unknownRows.length} řádků vyžaduje kontrolu
                        </span>
                      )}
                    </div>
                    {card.unknownRows.length > 0 && (
                      <details className="unknown-card-rows">
                        <summary>
                          Vyžaduje kontrolu: nerozpoznané hodnoty
                        </summary>
                        {card.unknownRows.map((raw) => (
                          <div key={raw.row}>
                            <strong>Řádek {raw.row}</strong>
                            <span>{raw.values.join(" | ")}</span>
                          </div>
                        ))}
                      </details>
                    )}
                    <label className="field">
                      <span>Rozhodnutí</span>
                      <select
                        name={`decision-${row.id}`}
                        required
                        defaultValue={
                          row.status === "ERROR"
                            ? "skip"
                            : preview.match.candidate
                              ? `match:${preview.match.candidate.id}`
                              : "create"
                        }
                      >
                        {row.status !== "ERROR" && (
                          <option value="create">NOVÝ PROSTŘEDEK</option>
                        )}
                        {row.status !== "ERROR" && preview.match.candidate && (
                          <option value={`match:${preview.match.candidate.id}`}>
                            Spárovat: {preview.match.candidate.name}
                          </option>
                        )}
                        {row.status !== "ERROR" &&
                          equipment.map((item) => (
                            <option value={`match:${item.id}`} key={item.id}>
                              Ruční výběr: {item.name} · {item.uid}
                              {item.serialNumber
                                ? ` · ${item.serialNumber}`
                                : ""}
                            </option>
                          ))}
                        <option value="skip">PŘESKOČIT</option>
                      </select>
                    </label>
                  </section>
                );
              })}
            </div>
            <div className="card confirmation">
              <span>Zápis proběhne až po potvrzení všech karet.</span>
              <button className="button">Potvrdit a importovat</button>
            </div>
          </form>
        )}
      </div>
    </AppShell>
  );
}
