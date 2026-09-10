import { notFound } from "next/navigation";
import { CheckCircle2, FlaskConical, PlayCircle } from "lucide-react";
import { executeImport, runDryImport } from "@/app/actions/import";
import { AppShell } from "@/components/app-shell";
import { requireImportAdministrator } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import type { ParsedEquipmentRow } from "@/lib/import/xlsx";

export const dynamic = "force-dynamic";
const labels: Record<string, string> = {
  NEW: "NOVÝ",
  UPDATE: "AKTUALIZACE",
  SKIP: "PŘESKOČIT",
  WARNING: "VAROVÁNÍ",
  ERROR: "CHYBA",
  IMPORTED: "IMPORTOVÁNO",
};
export default async function ImportDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ chyba?: string; dry?: string; hotovo?: string }>;
}) {
  const user = await requireImportAdministrator();
  const { id } = await params;
  const query = await searchParams;
  const job = await prisma.importJob.findUnique({
    where: { id },
    include: {
      rows: { orderBy: [{ sheetName: "asc" }, { rowNumber: "asc" }] },
    },
  });
  if (!job) notFound();
  const summary = (job.summaryJson ?? {}) as Record<string, unknown>;
  const sheets = (summary.sheets ?? []) as { name: string; rows: number }[];
  const equipment = job.rows.filter((r) => r.sheetName === "Kontrola 1");
  const protocols = job.rows.filter(
    (r) => r.sheetName === "Historie protokolů",
  );
  const completed = job.status === "COMPLETED" || job.status === "FAILED";
  return (
    <AppShell userName={user.displayName}>
      <div className="content">
        <div className="page-head">
          <div>
            <p className="eyebrow">Import · {job.status}</p>
            <h1>{job.fileName}</h1>
            <p className="muted">
              Kontrolní součet SHA-256: {job.checksum.slice(0, 16)}…
            </p>
          </div>
        </div>
        {query.chyba && <div className="error import-error">{query.chyba}</div>}
        {completed && (
          <div
            className={`result-banner ${job.status === "COMPLETED" ? "success" : ""}`}
          >
            <CheckCircle2 />
            <div>
              <strong>
                {job.status === "COMPLETED"
                  ? "Import dokončen"
                  : "Import dokončen s chybami"}
              </strong>
              <p>
                Vytvořeno {job.createdRows}, aktualizováno {job.updatedRows},
                přeskočeno {job.skippedRows}, chyby {job.errorRows}.
              </p>
            </div>
          </div>
        )}
        <section className="grid-stats import-stats">
          <div className="card stat">
            <span>Listy</span>
            <strong>{sheets.length}</strong>
            <small>{sheets.map((s) => s.name).join(", ")}</small>
          </div>
          <div className="card stat ok">
            <span>Prostředky</span>
            <strong>{equipment.length}</strong>
          </div>
          <div className="card stat">
            <span>Historické protokoly</span>
            <strong>{protocols.length}</strong>
          </div>
          <div className="card stat danger">
            <span>Chyby / varování</span>
            <strong>
              {job.errorRows} / {job.warningRows}
            </strong>
          </div>
        </section>
        <form>
          <input type="hidden" name="jobId" value={job.id} />
          <section className="card mapping">
            <div className="panel-head">
              <h2>Mapování sloupců</h2>
              <span className="muted">
                Mapování lze před importem zkontrolovat
              </span>
            </div>
            <div className="mapping-grid">
              {Object.entries(job.mappingJson as Record<string, string>).map(
                ([from, to]) => (
                  <div key={from}>
                    <strong>{from}</strong>
                    <span>→</span>
                    <select
                      name={`map-${from}`}
                      defaultValue={to}
                      aria-label={`Mapování ${from}`}
                    >
                      <option value={to}>{to}</option>
                      <option value="ignore">Ignorovat</option>
                    </select>
                  </div>
                ),
              )}
            </div>
            <p className="muted mapping-note">
              Umístění: PHA, SCANIA a TA → stejnojmenné vozidlo; STANICE →
              umístění Stanice. Neznámé hodnoty zůstanou ve varování.
            </p>
          </section>
          {equipment
            .filter(
              (row) =>
                (row.previewData as unknown as ParsedEquipmentRow)
                  .requiresMapping,
            )
            .map((importRow) => {
              const preview =
                importRow.previewData as unknown as ParsedEquipmentRow;
              return (
                <section
                  className="card requirement-mapping"
                  key={importRow.id}
                >
                  <div className="panel-head">
                    <div>
                      <h2>{preview.name}</h2>
                      <span className="muted">
                        {preview.uid} · VYŽADUJE MAPOVÁNÍ
                      </span>
                    </div>
                  </div>
                  <div className="source-dates">
                    <strong>Data nalezená v původním řádku:</strong> poslední{" "}
                    {preview.lastCompletedAt
                      ? new Date(preview.lastCompletedAt).toLocaleDateString(
                          "cs-CZ",
                        )
                      : "neznámé"}
                    , další{" "}
                    {preview.nextDueAt
                      ? new Date(preview.nextDueAt).toLocaleDateString("cs-CZ")
                      : "neznámé"}
                    . Sama se nepřiřadí.
                  </div>
                  <div className="requirement-editor">
                    {preview.requirements.map((requirement, index) => {
                      const prefix = `requirement-${importRow.id}-${requirement.key}`;
                      return (
                        <fieldset key={requirement.key}>
                          <legend>
                            {index + 1}. {requirement.name}
                          </legend>
                          <div className="form-grid">
                            <div className="field">
                              <label>Interval</label>
                              <div className="inline-fields">
                                <input
                                  name={`${prefix}-intervalValue`}
                                  type="number"
                                  min="1"
                                  defaultValue={requirement.intervalValue}
                                />
                                <select
                                  name={`${prefix}-intervalUnit`}
                                  defaultValue={
                                    requirement.intervalUnit ?? "MONTHS"
                                  }
                                >
                                  <option value="DAYS">dní</option>
                                  <option value="WEEKS">týdnů</option>
                                  <option value="MONTHS">měsíců</option>
                                  <option value="YEARS">let</option>
                                </select>
                              </div>
                            </div>
                            <div className="field">
                              <label>Poslední provedení</label>
                              <select
                                name={`${prefix}-lastChoice`}
                                defaultValue="unknown"
                              >
                                <option value="unknown">Neznámé</option>
                                {preview.lastCompletedAt && (
                                  <option value="source">
                                    Použít původní datum
                                  </option>
                                )}
                                <option value="manual">Zadat ručně</option>
                              </select>
                              <input
                                name={`${prefix}-manualLast`}
                                type="date"
                                aria-label={`Ruční poslední datum ${requirement.name}`}
                              />
                            </div>
                            <div className="field">
                              <label>Další termín</label>
                              <select
                                name={`${prefix}-nextChoice`}
                                defaultValue="unknown"
                              >
                                <option value="unknown">Neznámý</option>
                                {preview.nextDueAt && (
                                  <option value="source">
                                    Použít původní datum
                                  </option>
                                )}
                                <option value="manual">Zadat ručně</option>
                              </select>
                              <input
                                name={`${prefix}-manualNext`}
                                type="date"
                                aria-label={`Ruční další termín ${requirement.name}`}
                              />
                            </div>
                            <label className="review-check">
                              <input name={`${prefix}-later`} type="checkbox" />{" "}
                              Doplnit později
                            </label>
                          </div>
                        </fieldset>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          <section className="card table-wrap import-preview">
            <div className="panel-head">
              <h2>Náhled prostředků</h2>
              <span>{equipment.length} řádků</span>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Stav</th>
                  <th>UID</th>
                  <th>Název</th>
                  <th>ID</th>
                  <th>Vůz</th>
                  <th>Povinnosti</th>
                  <th>Poslední kontrola</th>
                  <th>Další termín</th>
                  <th>Protokol</th>
                  <th>Poznámka</th>
                </tr>
              </thead>
              <tbody>
                {equipment.slice(0, 500).map((r) => {
                  const p = r.previewData as Record<string, unknown>;
                  const preview =
                    r.previewData as unknown as ParsedEquipmentRow;
                  return (
                    <tr key={r.id}>
                      <td>
                        <span
                          className={`badge import-${r.status.toLowerCase()}`}
                        >
                          {labels[r.status]}
                        </span>
                      </td>
                      <td>{r.uid}</td>
                      <td>{String(p.name ?? "")}</td>
                      <td>{String(p.legacyId ?? "")}</td>
                      <td>{String(p.vehicle ?? "")}</td>
                      <td>
                        {Array.isArray(p.requirements)
                          ? p.requirements
                              .map((v) => (v as { name: string }).name)
                              .join(", ")
                          : ""}
                      </td>
                      <td>
                        {p.lastCompletedAt
                          ? new Date(
                              String(p.lastCompletedAt),
                            ).toLocaleDateString("cs-CZ")
                          : "—"}
                      </td>
                      <td>
                        {p.nextDueAt
                          ? new Date(String(p.nextDueAt)).toLocaleDateString(
                              "cs-CZ",
                            )
                          : "—"}
                      </td>
                      <td>{String(p.protocolReference ?? "—")}</td>
                      <td className="message-cell">
                        {r.message ?? "—"}
                        {preview.legacyIdRepair && (
                          <label className="repair-proposal">
                            <span>
                              Databáze: {preview.legacyIdRepair.current}
                            </span>
                            <span>XLSX: {preview.legacyIdRepair.proposed}</span>
                            <strong>
                              <input
                                type="checkbox"
                                name={`repairLegacyId-${r.id}`}
                              />{" "}
                              OPRAVIT PŮVODNÍ ID
                            </strong>
                          </label>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
          {!completed && (
            <section className="card confirmation">
              <div>
                <strong>Import upraví databázi TSHZS.</strong>
                <p className="muted">
                  Nejprve proveďte kontrolní běh bez zápisu. Import s chybami
                  nelze potvrdit.
                </p>
              </div>
              <div className="confirm-actions">
                <button
                  className="button secondary"
                  type="submit"
                  formAction={runDryImport}
                >
                  <FlaskConical size={18} />
                  Provést dry-run
                </button>
                <button
                  className="button"
                  type="submit"
                  disabled={job.status !== "DRY_RUN_READY" || job.errorRows > 0}
                  formAction={executeImport}
                >
                  <PlayCircle size={18} />
                  PROVÉST IMPORT
                </button>
              </div>
            </section>
          )}
        </form>
      </div>
    </AppShell>
  );
}
