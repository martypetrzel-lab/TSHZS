import { notFound } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ClipboardCheck,
  MapPin,
  Pencil,
  QrCode,
  Wrench,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canEditEquipment } from "@/lib/permissions";
import { recordOperatingHours } from "@/app/actions/operating-log";
export const dynamic = "force-dynamic";
const statuses: Record<string, string> = {
  IN_SERVICE: "V PROVOZU",
  OUT_OF_SERVICE: "MIMO PROVOZ",
  IN_REPAIR: "V OPRAVĚ",
  AWAITING_INSPECTION: "ČEKÁ NA KONTROLU",
  AWAITING_REVISION: "ČEKÁ NA REVIZI",
  LOANED: "ZAPŮJČENO",
  IN_STOCK: "SKLAD",
  RETIRED: "VYŘAZENO",
  LOST: "ZTRACENO",
  WINTERIZED: "ZAZIMOVÁNO",
};
export default async function EquipmentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const item = await prisma.equipmentItem.findUnique({
    where: { id },
    include: {
      category: true,
      location: true,
      vehicle: true,
      assignedUser: true,
      specifications: { orderBy: { sortOrder: "asc" } },
      logEntries: { orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }] },
      inspections: {
        include: { protocol: true, requirement: true },
        orderBy: { completedAt: "desc" },
      },
      requirements: {
        where: { archivedAt: null },
        include: {
          ruleVersion: {
            include: { rule: { include: { sourceDocument: true } } },
          },
          history: { orderBy: { recordedAt: "desc" } },
        },
        orderBy: { nextDueAt: "asc" },
      },
      legacyProtocols: { orderBy: { createdAt: "desc" } },
      defects: { where: { closedAt: null } },
      components: true,
      statusHistory: { orderBy: { changedAt: "desc" }, take: 5 },
      operatingLogs: { orderBy: { date: "desc" }, take: 20 },
    },
  });
  if (!item) notFound();
  const [documents, audit, defectHistory] = await Promise.all([
    prisma.attachment.findMany({
      where: { ownerType: "EquipmentItem", ownerId: item.id, archivedAt: null },
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditLog.findMany({
      where: { entityType: "EquipmentItem", entityId: item.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.defect.findMany({
      where: { equipmentId: item.id },
      include: {
        serviceCase: {
          include: { events: { orderBy: { createdAt: "desc" } } },
        },
      },
      orderBy: { foundAt: "desc" },
    }),
  ]);
  const blocked = item.complianceStatus === "OVERDUE_BLOCKED";
  const next = item.requirements[0];
  const today = new Date();
  const canEdit = canEditEquipment(user.roles.map(({ role }) => role.code));
  return (
    <AppShell userName={user.displayName}>
      <div className="content">
        <div className="page-head">
          <div>
            <p className="eyebrow">{item.uid}</p>
            <h1>{item.name}</h1>
            <p className="muted">
              {item.manufacturer ?? "Výrobce neuveden"} {item.model ?? ""} ·
              Výr. č. {item.serialNumber ?? "neuvedeno"}
            </p>
          </div>
          <div className="page-actions">
            <button className="button">
              <ClipboardCheck size={18} />
              Provést kontrolu
            </button>
            {canEdit && (
              <Link
                className="button secondary"
                href={`/prostredky/${item.id}/upravit`}
              >
                <Pencil size={18} />
                Upravit prostředek
              </Link>
            )}
          </div>
        </div>
        <nav className="equipment-tabs" aria-label="Sekce karty prostředku">
          <a href="#prehled">Přehled</a>
          <a href="#technicke-udaje">Technické údaje</a>
          <a href="#povinnosti">Povinnosti</a>
          <a href="#kontroly">Kontroly</a>
          <a href="#revize">Revize</a>
          <a href="#provozni-denik">Provozní deník</a>
          <a href="#zavady">Závady a opravy</a>
          <a href="#dokumenty">Dokumenty</a>
          <a href="#historie">Historie</a>
        </nav>
        <section className="status-strip" id="prehled">
          <div className="status-block">
            <span>Provozuschopnost</span>
            <strong style={{ color: blocked ? "#b91c1c" : "#166534" }}>
              {blocked ? "BLOKOVÁNO – PROŠLÝ TERMÍN" : statuses[item.status]}
            </strong>
          </div>
          <div className="status-block">
            <span>Termíny</span>
            <strong>
              {next?.nextDueAt
                ? `${next.name}: ${next.nextDueAt.toLocaleDateString("cs-CZ")}`
                : "Interval není definován"}
            </strong>
          </div>
          <div className="status-block">
            <span>Závady</span>
            <strong>
              {item.defects.length
                ? `${item.defects.length} otevřených závad`
                : "Bez otevřené závady"}
            </strong>
          </div>
        </section>
        {item.needsReview && (
          <div className="reason review-notice">
            <strong>Vyžaduje doplnění</strong>
            <p>
              U tohoto prostředku chyběl v původní evidenci název nebo jiný
              důležitý údaj. Doplňte prosím správné údaje.
            </p>
            <Link className="button" href={`/prostredky/${item.id}/upravit`}>
              Doplnit údaje
            </Link>
          </div>
        )}
        {blocked && next && (
          <div className="reason">
            <strong>
              <AlertTriangle
                size={18}
                style={{ display: "inline", marginRight: 8 }}
              />
              Proč je prostředek blokován?
            </strong>
            <p>
              Povinnost „{next.name}“ je po termínu. Termín:{" "}
              {next.nextDueAt?.toLocaleDateString("cs-CZ")}.
            </p>
            <small className="muted">
              Zdroj:{" "}
              {next.ruleVersion?.rule.sourceDocument?.title ??
                "Individuální pravidlo"}
              . Prostředek lze uvolnit až po platném splnění povinnosti.
            </small>
          </div>
        )}
        <section className="card equipment-technical" id="technicke-udaje">
          <div className="panel-head">
            <h2>Technické údaje</h2>
          </div>
          <dl className="technical-grid">
            <div>
              <dt>UID aplikace</dt>
              <dd>{item.uid}</dd>
            </div>
            <div>
              <dt>Původní identifikační číslo</dt>
              <dd>{item.legacyIdentificationNumber ?? item.legacyId ?? "—"}</dd>
            </div>
            <div>
              <dt>Evidenční číslo</dt>
              <dd>{item.registrationNumber ?? "—"}</dd>
            </div>
            <div>
              <dt>Výrobní číslo</dt>
              <dd>{item.serialNumber ?? "—"}</dd>
            </div>
            <div>
              <dt>Druh prostředku</dt>
              <dd>{item.typeName ?? item.category.name}</dd>
            </div>
            <div>
              <dt>Výrobce</dt>
              <dd>{item.manufacturer ?? "—"}</dd>
            </div>
            <div>
              <dt>Model / typ</dt>
              <dd>{item.model ?? "—"}</dd>
            </div>
            <div>
              <dt>Materiál</dt>
              <dd>{item.material ?? "—"}</dd>
            </div>
            <div>
              <dt>Datum výroby</dt>
              <dd>
                {item.manufacturedAt?.toLocaleDateString("cs-CZ") ??
                  item.manufacturingText ??
                  "—"}
              </dd>
            </div>
            <div>
              <dt>Datum zavedení</dt>
              <dd>
                {item.commissionedAt?.toLocaleDateString("cs-CZ") ??
                  item.commissioningText ??
                  "—"}
              </dd>
            </div>
            <div>
              <dt>Vozidlo</dt>
              <dd>{item.vehicle?.name ?? "—"}</dd>
            </div>
            <div>
              <dt>Umístění</dt>
              <dd>{item.location?.name ?? "—"}</dd>
            </div>
            <div>
              <dt>Osobní přidělení</dt>
              <dd>
                {item.assignedUser?.displayName ??
                  item.assignedPersonText ??
                  "—"}
              </dd>
            </div>
          </dl>
          {item.technicalDescription && (
            <p className="technical-description">{item.technicalDescription}</p>
          )}
          <div className="specification-grid">
            {item.specifications.map((spec) => (
              <div key={spec.id}>
                <span>{spec.name}</span>
                <strong>
                  {spec.value} {spec.unit}
                </strong>
                <small>{spec.source ?? "Ručně"}</small>
              </div>
            ))}
          </div>
        </section>
        {(item.currentOperatingHours !== null ||
          item.requirements.some(
            (r) => r.intervalUnit === "OPERATING_HOURS",
          )) && (
          <section className="card operating-card">
            <div className="panel-head">
              <h2>Provozní deník a motohodiny</h2>
              <strong>
                {item.currentOperatingHours?.toString() ?? "0"} mh
              </strong>
            </div>
            {canEdit && (
              <form action={recordOperatingHours} className="operating-form">
                <input type="hidden" name="equipmentId" value={item.id} />
                <label>
                  Datum
                  <input
                    type="date"
                    name="date"
                    required
                    defaultValue={new Date().toISOString().slice(0, 10)}
                  />
                </label>
                <label>
                  Stav motohodin
                  <input
                    type="number"
                    min={Number(item.currentOperatingHours ?? 0)}
                    step="0.01"
                    name="operatingHours"
                    required
                  />
                </label>
                <label>
                  Poznámka
                  <input name="note" />
                </label>
                <button className="button">Uložit odečet</button>
              </form>
            )}
            <div className="panel-body">
              {item.operatingLogs.map((log) => (
                <div className="history-row" key={log.id}>
                  <span>{log.date.toLocaleDateString("cs-CZ")}</span>
                  <strong>{log.operatingHours.toString()} mh</strong>
                  <span>+{log.hoursDelta.toString()} mh</span>
                  <span>{log.note ?? "—"}</span>
                </div>
              ))}
            </div>
          </section>
        )}
        <section className="dashboard-grid">
          <div className="card">
            <div className="panel-head">
              <h2>Základní údaje</h2>
            </div>
            <div className="panel-body">
              <div className="deadline">
                <MapPin size={18} />
                <div>
                  <strong>Umístění</strong>
                  <span>
                    {item.vehicle?.name ?? item.location?.name ?? "Neurčeno"}
                  </span>
                </div>
              </div>
              <div className="deadline">
                <QrCode size={18} />
                <div>
                  <strong>Identifikace</strong>
                  <span>
                    UID {item.uid} · Původní ID {item.legacyId ?? "neuvedeno"}
                  </span>
                </div>
              </div>
              <div className="deadline">
                <Wrench size={18} />
                <div>
                  <strong>Kategorie</strong>
                  <span>{item.category.name}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="panel-head">
              <h2>Povinnosti</h2>
            </div>
            <div className="panel-body">
              {item.requirements.length ? (
                item.requirements.map((r) => (
                  <div className="deadline" key={r.id}>
                    <i
                      className={`dot ${r.status === "OVERDUE_BLOCKED" ? "red" : r.status === "DUE_SOON" ? "orange" : "yellow"}`}
                    />
                    <div>
                      <strong>{r.name}</strong>
                      <span>
                        {r.ruleVersion?.rule.sourceType ??
                          "Bez zdroje pravidla"}
                      </span>
                    </div>
                    <time>
                      {r.nextDueAt?.toLocaleDateString("cs-CZ") ??
                        "Nedefinováno"}
                    </time>
                  </div>
                ))
              ) : (
                <p className="muted">
                  Interval není definován. Doplňte požadavek výrobce nebo
                  interního předpisu.
                </p>
              )}
            </div>
          </div>
        </section>
        <section className="card requirement-table-card" id="povinnosti">
          <div className="panel-head">
            <h2>POVINNOSTI A TERMÍNY</h2>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Typ</th>
                  <th>Interval</th>
                  <th>Poslední</th>
                  <th>Další termín</th>
                  <th>Zbývá</th>
                  <th>Stav</th>
                  <th>Zdroj</th>
                  <th>Akce</th>
                </tr>
              </thead>
              <tbody>
                {item.requirements.map((requirement) => {
                  const remaining = requirement.nextDueAt
                    ? Math.ceil(
                        (requirement.nextDueAt.getTime() - today.getTime()) /
                          86_400_000,
                      )
                    : null;
                  const unit = {
                    DAYS: "dní",
                    WEEKS: "týdnů",
                    MONTHS: "měsíců",
                    YEARS: "let",
                    OPERATING_HOURS: "motohodin",
                    USAGE_COUNT: "použití",
                  }[requirement.intervalUnit ?? "DAYS"];
                  return (
                    <tr key={requirement.id}>
                      <td>
                        {requirement.type === "REVISION"
                          ? "Revize"
                          : requirement.type === "INSPECTION"
                            ? "Pravidelná kontrola"
                            : requirement.name}
                      </td>
                      <td>
                        {requirement.trigger !== "PERIODIC"
                          ? "Při události"
                          : requirement.intervalValue
                            ? `${requirement.intervalValue} ${unit}`
                            : "—"}
                      </td>
                      <td>
                        {requirement.lastCompletedAt?.toLocaleDateString(
                          "cs-CZ",
                        ) ?? "—"}
                      </td>
                      <td>
                        {requirement.intervalUnit === "OPERATING_HOURS"
                          ? requirement.nextOperatingHours
                            ? `${requirement.nextOperatingHours} mh`
                            : "Doplnit odečet"
                          : requirement.intervalUnit === "USAGE_COUNT"
                            ? (requirement.nextUsageCount ?? "Doplnit počet")
                            : requirement.trigger !== "PERIODIC"
                              ? "Aktivuje událost"
                              : (requirement.nextDueAt?.toLocaleDateString(
                                  "cs-CZ",
                                ) ?? "—")}
                      </td>
                      <td>
                        {remaining === null
                          ? "—"
                          : remaining < 0
                            ? `${Math.abs(remaining)} dní po termínu`
                            : `${remaining} dní`}
                      </td>
                      <td>
                        <span
                          className={`badge ${remaining !== null && remaining < 0 ? "danger" : remaining !== null && remaining <= 30 ? "warn" : ""}`}
                        >
                          {remaining === null
                            ? "Nedefinováno"
                            : remaining < 0
                              ? "Po termínu"
                              : remaining <= 30
                                ? "Blíží se"
                                : "Platná"}
                        </span>
                      </td>
                      <td>
                        {requirement.source ??
                          requirement.ruleVersion?.rule.sourceDocument?.title ??
                          "—"}
                      </td>
                      <td>
                        <div className="requirement-actions">
                          <Link
                            href={`${requirement.type === "REVISION" ? "/revize" : "/kontroly"}?equipmentId=${item.id}&requirementId=${requirement.id}`}
                          >
                            {requirement.type === "REVISION"
                              ? "Zadat revizi"
                              : "Provést kontrolu"}
                          </Link>
                          <Link
                            href={`/prostredky/${item.id}/upravit#povinnosti`}
                          >
                            Upravit termín
                          </Link>
                          <a href={`#historie-${requirement.id}`}>
                            Zobrazit historii
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!item.requirements.length && (
              <div className="empty-state">
                Nejsou evidovány žádné povinnosti.
              </div>
            )}
          </div>
          {item.requirements.map((requirement) => (
            <details
              id={`historie-${requirement.id}`}
              className="requirement-history"
              key={`history-${requirement.id}`}
            >
              <summary>Historie: {requirement.name}</summary>
              {requirement.history.length ? (
                requirement.history.map((entry) => (
                  <div className="history-row" key={entry.id}>
                    <span>{entry.recordedAt.toLocaleDateString("cs-CZ")}</span>
                    <span>
                      Poslední:{" "}
                      {entry.lastCompletedAt?.toLocaleDateString("cs-CZ") ??
                        "—"}
                    </span>
                    <span>
                      Další:{" "}
                      {entry.nextDueAt?.toLocaleDateString("cs-CZ") ?? "—"}
                    </span>
                    <span>{entry.note ?? "Změna povinnosti"}</span>
                  </div>
                ))
              ) : (
                <p className="muted">Historie zatím neobsahuje záznamy.</p>
              )}
            </details>
          ))}
        </section>
        <section className="card equipment-records" id="kontroly">
          <div className="panel-head">
            <h2>Kontroly</h2>
          </div>
          <div className="panel-body">
            {item.inspections
              .filter((i) => i.requirement?.type !== "REVISION")
              .map((i) => (
                <div className="history-row" key={i.id}>
                  <span>
                    {i.completedAt?.toLocaleDateString("cs-CZ") ??
                      "Rozpracováno"}
                  </span>
                  <strong>{i.inspectionType}</strong>
                  <span>{i.result ?? i.state}</span>
                  <span>{i.protocol?.number ?? "Bez protokolu"}</span>
                </div>
              ))}
          </div>
        </section>
        <section className="card equipment-records" id="revize">
          <div className="panel-head">
            <h2>Revize</h2>
          </div>
          <div className="panel-body">
            {item.inspections
              .filter((i) => i.requirement?.type === "REVISION")
              .map((i) => (
                <div className="history-row" key={i.id}>
                  <span>
                    {i.completedAt?.toLocaleDateString("cs-CZ") ??
                      "Rozpracováno"}
                  </span>
                  <strong>{i.inspectionType}</strong>
                  <span>{i.result ?? i.state}</span>
                  <span>{i.protocol?.number ?? "Bez protokolu"}</span>
                </div>
              ))}
          </div>
        </section>
        <section className="card equipment-records" id="provozni-denik">
          <div className="panel-head">
            <h2>Provozní deník</h2>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Nasazení / místo</th>
                  <th>Doba</th>
                  <th>Závada</th>
                  <th>Odstranění</th>
                  <th>Poznámka / původní podpis</th>
                </tr>
              </thead>
              <tbody>
                {item.logEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      {entry.occurredAt?.toLocaleDateString("cs-CZ") ?? "—"}
                    </td>
                    <td>{entry.locationText ?? entry.description ?? "—"}</td>
                    <td>
                      {entry.durationMinutes != null
                        ? `${entry.durationMinutes} min`
                        : "—"}
                    </td>
                    <td>{entry.defectDescription ?? "—"}</td>
                    <td>{entry.remedyDescription ?? "—"}</td>
                    <td>{entry.note ?? entry.legacySignatureText ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card equipment-records" id="zavady">
          <div className="panel-head">
            <h2>Závady a opravy</h2>
          </div>
          <div className="panel-body">
            {defectHistory.map((defect) => (
              <div className="defect-record" key={defect.id}>
                <strong>{defect.description}</strong>
                <span>
                  {defect.foundAt.toLocaleDateString("cs-CZ")} ·{" "}
                  {defect.severity} ·{" "}
                  {defect.closedAt ? "Uzavřeno" : "Otevřeno"}
                </span>
                {defect.serviceCase?.events.map((event) => (
                  <small key={event.id}>
                    {event.createdAt.toLocaleDateString("cs-CZ")}:{" "}
                    {event.description}
                  </small>
                ))}
              </div>
            ))}
          </div>
        </section>
        <section className="dashboard-grid">
          <div className="card" id="dokumenty">
            <div className="panel-head">
              <h2>Historické protokoly</h2>
            </div>
            <div className="panel-body">
              {documents.map((document) => (
                <div className="deadline" key={document.id}>
                  <i className="dot" />
                  <div>
                    <strong>{document.fileName}</strong>
                    <span>
                      {document.mimeType} ·{" "}
                      {(Number(document.sizeBytes) / 1024).toFixed(0)} kB
                    </span>
                  </div>
                </div>
              ))}
              {item.legacyProtocols.length ? (
                item.legacyProtocols.map((protocol) => (
                  <div className="deadline" key={protocol.id}>
                    <i className="dot" />
                    <div>
                      <strong>{protocol.number}</strong>
                      <span>Importovaný uzavřený protokol</span>
                    </div>
                    {protocol.externalUrl ? (
                      <a
                        className="button secondary"
                        href={protocol.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Otevřít původní PDF
                      </a>
                    ) : (
                      <span className="muted">Bez PDF</span>
                    )}
                  </div>
                ))
              ) : (
                <p className="muted">
                  K prostředku nejsou uloženy historické protokoly.
                </p>
              )}
            </div>
          </div>
          <div className="card">
            <div className="panel-head">
              <h2>Import metadata</h2>
            </div>
            <div className="panel-body">
              <div className="deadline">
                <i className="dot" />
                <div>
                  <strong>Zdroj záznamu</strong>
                  <span>
                    {item.importedAt
                      ? `Původní evidence · ${item.importedAt.toLocaleDateString("cs-CZ")}`
                      : "Ručně založený záznam"}
                  </span>
                </div>
              </div>
              {item.legacyProtocolReference && (
                <div className="deadline">
                  <i className="dot" />
                  <div>
                    <strong>Původní reference protokolu</strong>
                    <span>{item.legacyProtocolReference}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
        <section className="card equipment-records" id="historie">
          <div className="panel-head">
            <h2>Historie</h2>
          </div>
          <div className="panel-body">
            {audit.map((entry) => (
              <div className="history-row" key={entry.id}>
                <span>{entry.createdAt.toLocaleString("cs-CZ")}</span>
                <strong>{entry.action}</strong>
                <span>{entry.reason ?? "—"}</span>
              </div>
            ))}
            {documents.length > 0 && (
              <p className="muted">Dokumentů v úložišti: {documents.length}</p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
