import Link from "next/link";
import { ModulePage } from "@/components/module-page";
import { requireUser } from "@/lib/auth";
import { operationalPermissions } from "@/lib/operational-authorization";
import { protocolTypes } from "@/lib/operational-workflow";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser(),
    q = await searchParams,
    permissions = await operationalPermissions(user.id),
    now = new Date();
  const [inspection, operational, equipment, users, suppliers, repairs] =
    await Promise.all([
      prisma.protocol.findMany({
        where: { equipment: { organizationId: user.organizationId } },
        include: { inspection: true },
      }),
      permissions.has("protocol:read")
        ? prisma.operationalProtocol.findMany({
            where: { organizationId: user.organizationId },
            include: { items: { include: { handover: true } } },
          })
        : [],
      prisma.equipmentItem.findMany({
        where: { organizationId: user.organizationId },
        include: { vehicle: true, location: true },
      }),
      prisma.user.findMany({
        where: { organizationId: user.organizationId },
        select: { id: true, displayName: true },
      }),
      prisma.serviceSupplier.findMany({
        where: { organizationId: user.organizationId },
      }),
      permissions.has("repair:manage") || permissions.has("repair:approve")
        ? prisma.repairCase.count({
            where: {
              organizationId: user.organizationId,
              state: "PENDING_APPROVAL",
            },
          })
        : 0,
    ]);
  const docs = [
    ...inspection.map((p) => ({
      id: p.id,
      number: p.number,
      date: p.protocolDate ?? p.createdAt,
      type: "INSPECTION",
      status: p.cancelledAt ? "CANCELLED" : "ISSUED",
      authorId: p.inspection?.inspectorId ?? "",
      equipmentIds: p.equipmentId ? [p.equipmentId] : [],
      supplierId: "",
      href: p.inspectionId
        ? `/kontroly/${p.inspectionId}`
        : p.equipmentId
          ? `/prostredky/${p.equipmentId}`
          : "/protokoly",
      pdf: p.inspectionId
        ? `/api/kontroly/${p.inspectionId}/pdf`
        : p.externalUrl,
      active: false,
      overdue: false,
    })),
    ...operational.map((p) => ({
      id: p.id,
      number: p.number ?? "Návrh – bez čísla",
      date: p.protocolDate,
      type: String(p.type),
      status: String(p.status),
      authorId: p.createdById,
      equipmentIds: p.items.map((i) => i.equipmentId),
      supplierId: p.supplierId ?? "",
      href: `/protokoly/provozni/${p.id}`,
      pdf: permissions.has("protocol:download")
        ? `/api/protokoly/${p.id}/pdf`
        : null,
      active: p.items.some((i) => i.handover && !i.handover.returnedAt),
      overdue: p.items.some(
        (i) =>
          i.handover &&
          !i.handover.returnedAt &&
          i.handover.expectedReturnAt &&
          i.handover.expectedReturnAt < now,
      ),
    })),
  ];
  const canSeeCancelled =
    permissions.has("protocol:cancel") ||
    user.roles.some((r) => ["ADMIN", "TS_ADMIN"].includes(r.role.code));
  const year = q.rok === "vse" ? null : Number(q.rok ?? now.getFullYear());
  const years = [
    ...new Set([
      now.getFullYear(),
      ...docs.map((d) => d.date.getUTCFullYear()),
    ]),
  ].sort((a, b) => b - a);
  const names: Record<string, string> = {
    INSPECTION: "Kontroly",
    ...protocolTypes,
  };
  const filtered = docs
    .filter((d) => {
      const items = equipment.filter((e) => d.equipmentIds.includes(e.id));
      return (
        (d.status !== "CANCELLED" ||
          (canSeeCancelled && q.stornovane === "1")) &&
        (year === null || d.date.getUTCFullYear() === year) &&
        (!q.typ || d.type === q.typ) &&
        (!q.stav || d.status === q.stav) &&
        (!q.cislo || d.number.includes(q.cislo)) &&
        (!q.hledat ||
          items.some((e) =>
            `${e.name} ${e.uid} ${e.serialNumber ?? ""} ${e.registrationNumber ?? ""}`
              .toLocaleLowerCase("cs")
              .includes(q.hledat!.toLocaleLowerCase("cs")),
          )) &&
        (!q.vozidlo || items.some((e) => e.vehicleId === q.vozidlo)) &&
        (!q.umisteni || items.some((e) => e.locationId === q.umisteni)) &&
        (!q.zpracoval || d.authorId === q.zpracoval) &&
        (!q.dodavatel || d.supplierId === q.dodavatel) &&
        (!q.od || d.date >= new Date(`${q.od}T00:00:00Z`)) &&
        (!q.do || d.date <= new Date(`${q.do}T23:59:59Z`)) &&
        (!q.predani || (q.predani === "po-terminu" ? d.overdue : d.active))
      );
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  const link = (changes: Record<string, string>) =>
    `/protokoly?${new URLSearchParams({ ...Object.fromEntries(Object.entries(q).filter((v): v is [string, string] => Boolean(v[1]))), ...changes })}`;
  return (
    <ModulePage eyebrow="Dokumentace" title="Protokoly">
      <div className="row-actions">
        {permissions.has("protocol:create") && (
          <Link className="button" href="/protokoly/novy">
            + Nový protokol
          </Link>
        )}
        {user.roles.some((r) => r.role.code === "ADMIN") && (
          <Link href="/administrace/opravneni">
            Přidělit provozní oprávnění
          </Link>
        )}
      </div>
      <section className="grid-stats">
        {[
          ["Protokoly celkem", docs.length],
          [
            "Vystaveno tento měsíc",
            docs.filter(
              (d) =>
                d.status === "ISSUED" &&
                d.date.getUTCFullYear() === now.getUTCFullYear() &&
                d.date.getUTCMonth() === now.getUTCMonth(),
            ).length,
          ],
          [
            "Rozpracované",
            operational.filter((d) => d.status === "DRAFT").length,
          ],
          ["Čeká na schválení", repairs],
          ["Aktivní předání", docs.filter((d) => d.active).length],
          [
            "Mimo provoz",
            equipment.filter((e) => e.status === "OUT_OF_SERVICE").length,
          ],
        ].map(([label, count]) => (
          <div className="card stat" key={String(label)}>
            <span>{label}</span>
            <strong>{count}</strong>
          </div>
        ))}
      </section>
      <nav className="inspection-tabs">
        <Link href={link({ typ: "", stav: "" })}>Všechny protokoly</Link>
        {Object.entries(names).map(([key, label]) => (
          <Link key={key} href={link({ typ: key, stav: "" })}>
            {label}
          </Link>
        ))}
        <Link href={link({ stav: "DRAFT", typ: "" })}>Rozpracované</Link>
      </nav>
      <nav className="inspection-tabs">
        {years.map((y) => (
          <Link
            key={y}
            className={year === y ? "active" : ""}
            href={link({ rok: String(y) })}
          >
            {y} (
            {
              docs.filter(
                (d) => d.status === "ISSUED" && d.date.getUTCFullYear() === y,
              ).length
            }
            )
          </Link>
        ))}
        <Link href={link({ rok: "vse" })}>Vše</Link>
      </nav>
      <form className="card inspection-filters">
        <input type="hidden" name="rok" value={q.rok ?? now.getFullYear()} />
        <input
          name="cislo"
          placeholder="Číslo protokolu"
          defaultValue={q.cislo}
        />
        <input
          name="hledat"
          placeholder="Název, UID, výrobní nebo evidenční číslo"
          defaultValue={q.hledat}
        />
        <select name="typ" defaultValue={q.typ}>
          <option value="">Všechny druhy</option>
          {Object.entries(names).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select name="stav" defaultValue={q.stav}>
          <option value="">Všechny stavy</option>
          <option value="DRAFT">Rozpracované</option>
          <option value="ISSUED">Vystavené</option>
          {canSeeCancelled && <option value="CANCELLED">Stornované</option>}
        </select>
        <select name="zpracoval" defaultValue={q.zpracoval}>
          <option value="">Všichni zpracovatelé</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName}
            </option>
          ))}
        </select>
        <select name="dodavatel" defaultValue={q.dodavatel}>
          <option value="">Všechny servisy</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {["vozidlo", "umisteni"].map((key) => (
          <select key={key} name={key} defaultValue={q[key]}>
            <option value="">
              {key === "vozidlo" ? "Všechna vozidla" : "Všechna umístění"}
            </option>
            {[
              ...new Map(
                equipment.flatMap((e) => {
                  const v = key === "vozidlo" ? e.vehicle : e.location;
                  return v ? [[v.id, v.name] as const] : [];
                }),
              ).entries(),
            ].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        ))}
        <input type="date" name="od" defaultValue={q.od} />
        <input type="date" name="do" defaultValue={q.do} />
        {canSeeCancelled && (
          <label>
            <input
              type="checkbox"
              name="stornovane"
              value="1"
              defaultChecked={q.stornovane === "1"}
            />{" "}
            Zobrazit stornované
          </label>
        )}
        <button className="button">Filtrovat</button>
      </form>
      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              {[
                "Datum",
                "Číslo protokolu",
                "Druh",
                "Prostředek / počet",
                "Zpracoval",
                "Stav",
                "Akce",
              ].map((t) => (
                <th key={t}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr
                key={d.id}
                className={d.status === "CANCELLED" ? "cancelled-record" : ""}
              >
                <td>{d.date.toLocaleDateString("cs-CZ")}</td>
                <td>{d.number}</td>
                <td>{names[d.type]}</td>
                <td>
                  {d.equipmentIds.length === 1
                    ? equipment.find((e) => e.id === d.equipmentIds[0])?.name
                    : `${d.equipmentIds.length} prostředků`}
                </td>
                <td>
                  {users.find((u) => u.id === d.authorId)?.displayName ??
                    "Původní evidence"}
                </td>
                <td>
                  {d.status === "DRAFT"
                    ? "Rozpracováno"
                    : d.status === "CANCELLED"
                      ? "STORNOVÁNO"
                      : "Vystaveno"}
                  {d.overdue && <p className="error">Po termínu vrácení</p>}
                </td>
                <td>
                  <div className="row-actions">
                    <Link href={d.href}>
                      {d.status === "DRAFT" ? "Pokračovat / upravit" : "Detail"}
                    </Link>
                    {d.pdf && <a href={d.pdf}>PDF / tisk</a>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <p>Žádné dokumenty neodpovídají filtru.</p>}
      </div>
    </ModulePage>
  );
}
