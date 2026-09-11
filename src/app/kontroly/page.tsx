import Link from "next/link";
import { ModulePage } from "@/components/module-page";
import { prisma } from "@/lib/prisma";
import {
  saveShiftInspection,
} from "@/app/actions/inspection";
import { CancelInspectionDialog, DeleteDraftButton } from "@/components/inspection-actions";
import { historyYear } from "@/lib/inspection-lifecycle";
import { requireUser } from "@/lib/auth";
import { canUserPerformInspection } from "@/lib/inspection-permissions";

export const dynamic = "force-dynamic";
const resultCs = {
  PASSED: "Vyhovuje",
  FAILED: "Nevyhovuje",
  PASSED_WITH_LIMITATION: "Vyhovuje s omezením",
} as const;
const intervalCs: Record<string, string> = {
  DAYS: "dní",
  WEEKS: "týdnů",
  MONTHS: "měsíců",
  YEARS: "let",
  OPERATING_HOURS: "mth",
  USAGE_COUNT: "použití",
};

function dueInfo(date: Date | null) {
  if (!date) return { days: null, label: "Termín neurčen", tone: "neutral" };
  const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  if (days < 0)
    return {
      days,
      label: `Po termínu ${Math.abs(days)} dní`,
      tone: "danger-dark",
    };
  if (days === 0) return { days, label: "Termín dnes", tone: "danger" };
  if (days <= 7) return { days, label: `Do ${days} dní`, tone: "danger" };
  if (days <= 30) return { days, label: `Do ${days} dní`, tone: "warn" };
  if (days <= 90) return { days, label: `Do ${days} dní`, tone: "soon" };
  return { days, label: `Za ${days} dní`, tone: "ok" };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const currentUser = await requireUser();
  const roleCodes = new Set(currentUser.roles.map((entry) => entry.role.code));
  const canManageDrafts = roleCodes.has("ADMIN") || roleCodes.has("TS_ADMIN");
  const tab = q.tab ?? "k-provedeni";
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dueAll = await prisma.equipmentRequirement.findMany({
    where: {
      archivedAt: null,
      type: "INSPECTION",
      trigger: "PERIODIC",
      nextDueAt: { lte: new Date(now.getTime() + 90 * 86_400_000) },
      equipment: { archivedAt: null },
    },
    include: {
      equipment: { include: { location: true, vehicle: true, category: true } },
      ruleVersion: { include: { rule: true } },
    },
    orderBy: { nextDueAt: "asc" },
  });
  const due = dueAll.filter((requirement) =>
    canUserPerformInspection(currentUser, requirement),
  );
  const drafts = await prisma.inspection.findMany({
    where: {
      state: "DRAFT",
      ...(!canManageDrafts ? { inspectorId: currentUser.id } : {}),
    },
    include: { equipment: true, requirement: true },
    orderBy: { startedAt: "desc" },
  });
  const allHistory = await prisma.inspection.findMany({
    where: { state: { in: ["CLOSED", "CORRECTED", "CANCELLED"] } },
    include: { equipment: true, requirement: true, protocol: true },
    orderBy: { completedAt: "desc" },
    take: 150,
  });
  const history = allHistory.filter((entry) =>
    entry.state !== "CANCELLED" || (canManageDrafts && q.stornovane === "1"),
  );
  const currentYear = now.getFullYear();
  const yearCounts = new Map<number, number>();
  for (const entry of allHistory)
    if (entry.state === "CLOSED" && !entry.protocol?.cancelledAt && entry.protocol)
      yearCounts.set(historyYear(entry.protocol), (yearCounts.get(historyYear(entry.protocol)) ?? 0) + 1);
  const years = [...new Set([currentYear, currentYear + 1, ...yearCounts.keys()])].sort((a, b) => a - b);
  const selectedYear = q.rok === "vse" ? null : Number(q.rok ?? currentYear);
  const users = await prisma.user.findMany({
    where: {
      id: {
        in: [...new Set([...drafts, ...history].map((i) => i.inspectorId))],
      },
    },
    select: { id: true, displayName: true },
  });
  const userNames = new Map(users.map((u) => [u.id, u.displayName]));
  const filteredHistory = history.filter((i) => {
    const text =
      `${i.equipment.name} ${i.equipment.uid} ${i.equipment.legacyId ?? ""} ${i.equipment.serialNumber ?? ""}`.toLocaleLowerCase(
        "cs",
      );
    const protocolDate = i.protocol?.protocolDate ?? i.completedAt ?? i.protocol?.createdAt ?? new Date(0);
    const performed = i.performedAt ?? i.completedAt ?? new Date(0);
    const filteredDate = q.datum === "kontroly" ? performed : protocolDate;
    return (
      (selectedYear == null || protocolDate.getUTCFullYear() === selectedYear) &&
      (!q.hledat || text.includes(q.hledat.toLocaleLowerCase("cs"))) &&
      (!q.kontrolujici || i.inspectorId === q.kontrolujici) &&
      (!q.typ || i.requirement?.name === q.typ) &&
      (!q.od || filteredDate >= new Date(`${q.od}T00:00:00`)) &&
      (!q.do || filteredDate <= new Date(`${q.do}T23:59:59`))
    );
  });
  const filteredDue = due
    .filter((r) => {
      const haystack =
        `${r.equipment.name} ${r.equipment.uid} ${r.equipment.legacyId ?? ""} ${r.equipment.serialNumber ?? ""}`.toLocaleLowerCase(
          "cs",
        );
      const info = dueInfo(r.nextDueAt);
      return (
        (!q.hledat || haystack.includes(q.hledat.toLocaleLowerCase("cs"))) &&
        (!q.vozidlo || r.equipment.vehicleId === q.vozidlo) &&
        (!q.umisteni || r.equipment.locationId === q.umisteni) &&
        (!q.kategorie || r.equipment.categoryId === q.kategorie) &&
        (!q.typ || r.name === q.typ) &&
        (!q.zdroj || r.sourceType === q.zdroj) &&
        (!q.stav ||
          (q.stav === "overdue"
            ? (info.days ?? 1) < 0
            : q.stav === "7"
              ? (info.days ?? 99) >= 0 && (info.days ?? 99) <= 7
              : q.stav === "30"
                ? (info.days ?? 99) > 7 && (info.days ?? 99) <= 30
                : true))
      );
    })
    .sort((a, b) =>
      q.razeni === "nazev"
        ? a.equipment.name.localeCompare(b.equipment.name, "cs")
        : q.razeni === "vozidlo"
          ? (a.equipment.vehicle?.name ?? "").localeCompare(
              b.equipment.vehicle?.name ?? "",
              "cs",
            )
          : q.razeni === "nejstarsi"
            ? (a.nextDueAt?.getTime() ?? 0) - (b.nextDueAt?.getTime() ?? 0)
            : (a.nextDueAt?.getTime() ?? Infinity) -
              (b.nextDueAt?.getTime() ?? Infinity),
    );
  const kpis = [
    ["K PROVEDENÍ", due.length],
    [
      "PO TERMÍNU",
      due.filter((r) => (dueInfo(r.nextDueAt).days ?? 0) < 0).length,
    ],
    [
      "DO 7 DNÍ",
      due.filter((r) => {
        const d = dueInfo(r.nextDueAt).days;
        return d != null && d >= 0 && d <= 7;
      }).length,
    ],
    [
      "DO 30 DNÍ",
      due.filter((r) => {
        const d = dueInfo(r.nextDueAt).days;
        return d != null && d >= 0 && d <= 30;
      }).length,
    ],
    ["ROZPRACOVANÉ", drafts.length],
    [
      "PROVEDENO TENTO MĚSÍC",
      history.filter((i) => i.completedAt && i.completedAt >= monthStart)
        .length,
    ],
  ];
  const tabLinks = [
    ["k-provedeni", "K provedení"],
    ["provest", "Provést kontrolu"],
    ["rozpracovane", "Rozpracované"],
    ["historie", "Historie"],
    ["smenove", "Směnové kontroly"],
  ];
  const vehicles = [
    ...new Map(
      due.flatMap((r) =>
        r.equipment.vehicle
          ? [[r.equipment.vehicle.id, r.equipment.vehicle.name] as const]
          : [],
      ),
    ).entries(),
  ];
  const locations = [
    ...new Map(
      due.flatMap((r) =>
        r.equipment.location
          ? [[r.equipment.location.id, r.equipment.location.name] as const]
          : [],
      ),
    ).entries(),
  ];
  const categories = [
    ...new Map(
      due.map(
        (r) => [r.equipment.category.id, r.equipment.category.name] as const,
      ),
    ).entries(),
  ];
  const types = [...new Set(due.map((r) => r.name))].sort();
  const sources = [
    ...new Set(due.map((r) => r.sourceType).filter(Boolean)),
  ] as string[];
  return (
    <ModulePage eyebrow="Kontrolní činnost" title="Kontroly">
      {q.chyba && <div className="error import-error">{q.chyba}</div>}
      <div className="inspection-kpis">
        {kpis.map(([label, value]) => (
          <div className="card inspection-kpi" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <nav className="inspection-tabs" aria-label="Sekce kontrol">
        {tabLinks.map(([key, label]) => (
          <Link
            className={tab === key ? "active" : ""}
            href={
              key === "provest" ? "/kontroly/provest" : `/kontroly?tab=${key}`
            }
            key={key}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "k-provedeni" && (
        <>
          <form className="card inspection-filters">
            <input
              name="hledat"
              defaultValue={q.hledat}
              placeholder="Název, UID, ID nebo výrobní číslo"
            />
            <select name="vozidlo" defaultValue={q.vozidlo}>
              <option value="">Všechna vozidla</option>
              {vehicles.map(([id, n]) => (
                <option value={id} key={id}>
                  {n}
                </option>
              ))}
            </select>
            <select name="umisteni" defaultValue={q.umisteni}>
              <option value="">Všechna umístění</option>
              {locations.map(([id, n]) => (
                <option value={id} key={id}>
                  {n}
                </option>
              ))}
            </select>
            <select name="kategorie" defaultValue={q.kategorie}>
              <option value="">Všechny kategorie</option>
              {categories.map(([id, n]) => (
                <option value={id} key={id}>
                  {n}
                </option>
              ))}
            </select>
            <select name="typ" defaultValue={q.typ}>
              <option value="">Všechny typy kontrol</option>
              {types.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
            <select name="zdroj" defaultValue={q.zdroj}>
              <option value="">Všechny zdroje</option>
              {sources.map((source) => (
                <option key={source}>{source}</option>
              ))}
            </select>
            <select name="stav" defaultValue={q.stav}>
              <option value="">Všechny termíny</option>
              <option value="overdue">Po termínu</option>
              <option value="7">Do 7 dní</option>
              <option value="30">8–30 dní</option>
            </select>
            <select name="razeni" defaultValue={q.razeni}>
              <option value="nejblizsi">Nejbližší termín</option>
              <option value="nejstarsi">Nejstarší termín</option>
              <option value="nazev">Název</option>
              <option value="vozidlo">Vozidlo</option>
            </select>
            <button className="button">Filtrovat</button>
          </form>
          <div className="card table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Stav</th>
                  <th>Termín</th>
                  <th>Zbývá</th>
                  <th>Prostředek</th>
                  <th>UID</th>
                  <th>Povinnost</th>
                  <th>Interval</th>
                  <th>Umístění / vozidlo</th>
                  <th>Zdroj pravidla</th>
                  <th>Akce</th>
                </tr>
              </thead>
              <tbody>
                {filteredDue.map((r) => {
                  const info = dueInfo(r.nextDueAt);
                  return (
                    <tr key={r.id}>
                      <td>
                        <span className={`due-badge ${info.tone}`}>
                          {info.label}
                        </span>
                      </td>
                      <td>{r.nextDueAt?.toLocaleDateString("cs-CZ") ?? "—"}</td>
                      <td>{info.days == null ? "—" : `${info.days} dní`}</td>
                      <td>{r.equipment.name}</td>
                      <td>{r.equipment.uid}</td>
                      <td>{r.name}</td>
                      <td>
                        {r.intervalValue ?? "—"}{" "}
                        {r.intervalUnit ? intervalCs[r.intervalUnit] : ""}
                      </td>
                      <td>
                        {r.equipment.vehicle?.name ??
                          r.equipment.location?.name ??
                          "—"}
                      </td>
                      <td>{r.source ?? r.ruleVersion?.rule.name ?? "—"}</td>
                      <td>
                        <div className="row-actions">
                          <Link
                            className="button"
                            href={`/kontroly/provest/${r.id}`}
                          >
                            Provést kontrolu
                          </Link>
                          <Link
                            className="button secondary"
                            href={`/prostredky/${r.equipmentId}`}
                          >
                            Detail
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filteredDue.length && (
              <div className="empty-state">
                Žádné kontroly neodpovídají filtru.
              </div>
            )}
          </div>
        </>
      )}
      {tab === "rozpracovane" && (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Naplánováno / zahájeno</th>
                <th>Prostředek</th>
                <th>Povinnost</th>
                <th>Kontrolující</th>
                <th>Akce</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((i) => (
                <tr key={i.id}>
                  <td>{i.scheduledFor ? <><span className="badge">NAPLÁNOVÁNO NA {i.scheduledFor.toLocaleDateString("cs-CZ")}</span><br /></> : null}{i.startedAt.toLocaleString("cs-CZ")}</td>
                  <td>{i.equipment.name}</td>
                  <td>{i.requirement?.name ?? i.inspectionType}</td>
                  <td>{userNames.get(i.inspectorId) ?? "—"}</td>
                  <td>
                    <div className="row-actions">
                      {i.requirementId && i.inspectorId === currentUser.id && (
                        <Link
                          className="button"
                          href={`/kontroly/provest/${i.requirementId}?draft=${i.id}`}
                        >
                          Pokračovat
                        </Link>
                      )}
                      {canManageDrafts && (
                        <DeleteDraftButton inspectionId={i.id} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === "historie" && (
        <>
          <nav className="inspection-tabs" aria-label="Rok historie">
            {years.map((year) => <Link className={selectedYear === year ? "active" : ""} href={`/kontroly?tab=historie&rok=${year}`} key={year}>{year} ({yearCounts.get(year) ?? 0})</Link>)}
            <Link className={selectedYear == null ? "active" : ""} href="/kontroly?tab=historie&rok=vse">Vše</Link>
          </nav>
          <form className="card inspection-filters">
            <input type="hidden" name="tab" value="historie" />
            <input type="hidden" name="rok" value={q.rok ?? currentYear} />
            <input
              name="hledat"
              defaultValue={q.hledat}
              placeholder="Název, UID, ID nebo výrobní číslo"
            />
            <select name="kontrolujici" defaultValue={q.kontrolujici}>
              <option value="">Všechny kontrolující osoby</option>
              {users.map((u) => (
                <option value={u.id} key={u.id}>
                  {u.displayName}
                </option>
              ))}
            </select>
            <select name="datum" defaultValue={q.datum ?? "protokolu"}>
              <option value="protokolu">Filtrovat podle data protokolu</option>
              <option value="kontroly">Filtrovat podle data kontroly</option>
            </select>
            <input type="date" name="od" defaultValue={q.od} />
            <input type="date" name="do" defaultValue={q.do} />
            {canManageDrafts && <label className="confirm-check"><input type="checkbox" name="stornovane" value="1" defaultChecked={q.stornovane === "1"} /> Zobrazit stornované</label>}
            <button className="button">Filtrovat historii</button>
          </form>
          <div className="card table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Datum kontroly</th>
                  <th>Datum protokolu</th>
                  <th>Prostředek</th>
                  <th>UID</th>
                  <th>Povinnost</th>
                  <th>Kontroloval</th>
                  <th>Výsledek</th>
                  <th>Protokol</th>
                  <th>Akce</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((i) => (
                  <tr key={i.id} className={i.state === "CANCELLED" ? "cancelled-record" : ""}>
                    <td>{(i.performedAt ?? i.completedAt)?.toLocaleDateString("cs-CZ") ?? "—"}</td>
                    <td>{(i.protocol?.protocolDate ?? i.protocol?.createdAt)?.toLocaleDateString("cs-CZ") ?? "—"}</td>
                    <td>{i.equipment.name}</td>
                    <td>{i.equipment.uid}</td>
                    <td>{i.requirement?.name ?? i.inspectionType}</td>
                    <td>{userNames.get(i.inspectorId) ?? "—"}</td>
                    <td>{i.result ? resultCs[i.result] : "—"}</td>
                    <td>{i.protocol?.number ?? "—"}{i.state === "CANCELLED" && <><br /><span className="badge">STORNOVÁNO</span></>}</td>
                    <td>
                      <div className="row-actions">
                        <Link
                          className="button secondary"
                          href={`/kontroly/${i.id}`}
                        >
                          Detail
                        </Link>
                        {i.protocol && (
                          <a
                            className="button secondary"
                            href={`/api/kontroly/${i.id}/pdf`}
                          >
                            PDF
                          </a>
                        )}
                        {i.state === "CLOSED" && canManageDrafts && <CancelInspectionDialog inspection={{ id: i.id, equipment: i.equipment.name, uid: i.equipment.uid, performed: (i.performedAt ?? i.completedAt)?.toLocaleDateString("cs-CZ") ?? "—", result: i.result ? resultCs[i.result] : "—", protocol: i.protocol?.number ?? "—", inspector: userNames.get(i.inspectorId) ?? "—" }} />}
                        {i.state === "CANCELLED" && <span title={i.cancellationReason ?? ""}>Důvod storna: {i.cancellationReason ?? "—"}</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === "smenove" && <ShiftPanel />}
    </ModulePage>
  );
}

async function ShiftPanel() {
  const vehicles = await prisma.vehicle.findMany({
    where: { archivedAt: null },
    include: {
      equipment: {
        where: { archivedAt: null },
        include: {
          requirements: {
            where: { archivedAt: null, trigger: "SHIFT_HANDOVER" },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });
  return (
    <div className="shift-grid">
      {vehicles.map((v) => (
        <form action={saveShiftInspection} className="card" key={v.id}>
          <input type="hidden" name="vehicleId" value={v.id} />
          <h2>{v.name}</h2>
          <p>
            {v.callSign ?? v.registrationPlate ?? "Vozidlo"} ·{" "}
            {v.equipment.length} prostředků
          </p>
          {v.equipment.map((e) => (
            <div className="shift-item" key={e.id}>
              <div>
                <strong>{e.name}</strong>
                <small>{e.uid}</small>
              </div>
              <div className="shift-actions">
                {[
                  ["OK", "V pořádku"],
                  ["DEFECT", "Závada"],
                  ["MISSING", "Chybí"],
                  ["USED", "Použito předchozí směnou"],
                ].map(([value, label]) => (
                  <label key={value}>
                    <input type="radio" name={`state-${e.id}`} value={value} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              {e.requirements.length > 0 && (
                <small>Vyžaduje konkrétní směnový checklist.</small>
              )}
            </div>
          ))}
          <button className="button">Uložit směnovou kontrolu</button>
        </form>
      ))}
    </div>
  );
}
