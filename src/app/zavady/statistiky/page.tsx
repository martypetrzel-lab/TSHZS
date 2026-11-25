import Link from "next/link";
import { ModulePage } from "@/components/module-page";
import { requireOperationalPermission } from "@/lib/operational-authorization";
import { repairStatistics } from "@/lib/repair-statistics";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireOperationalPermission("repair:costs_read"),
    q = await searchParams;
  const stats = await repairStatistics(user.organizationId, q);
  const [vehicles, categories, suppliers] = await Promise.all([
    prisma.vehicle.findMany({
      where: { station: { organizationId: user.organizationId } },
    }),
    prisma.equipmentCategory.findMany(),
    prisma.serviceSupplier.findMany({
      where: { organizationId: user.organizationId },
    }),
  ]);
  const multiCurrency = stats.currencies.length > 1;
  return (
    <ModulePage eyebrow="Ekonomická evidence" title="Statistiky oprav">
      <form className="card inspection-filters">
        <label>
          Rok
          <input
            type="number"
            name="rok"
            defaultValue={q.rok ?? new Date().getFullYear()}
          />
        </label>
        <input name="od" type="date" defaultValue={q.od} />
        <input name="do" type="date" defaultValue={q.do} />
        {[
          ["vozidlo", vehicles],
          ["kategorie", categories],
          ["dodavatel", suppliers],
          ["prostredek", stats.equipment],
        ].map(([key, values]) => (
          <select
            key={String(key)}
            name={String(key)}
            defaultValue={q[String(key)]}
          >
            <option value="">
              {
                (
                  {
                    vozidlo: "Všechna vozidla",
                    kategorie: "Všechny kategorie",
                    dodavatel: "Všechny servisy",
                    prostredek: "Všechny prostředky",
                  } as Record<string, string>
                )[String(key)]
              }
            </option>
            {(values as { id: string; name: string }[]).map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        ))}
        <input
          name="mena"
          placeholder="Měna (např. CZK)"
          defaultValue={q.mena}
          maxLength={3}
        />
        <button className="button">Filtrovat</button>
      </form>
      <Link
        href={`/api/opravy/export?${new URLSearchParams(Object.entries(q).filter((entry): entry is [string, string] => Boolean(entry[1])))}`}
      >
        Export CSV
      </Link>
      <section className="grid-stats">
        <div className="card stat">
          <span>Počet oprav</span>
          <strong>{stats.repairs.length}</strong>
        </div>
        <div className="card stat">
          <span>Skutečné náklady</span>
          <strong>
            {multiCurrency
              ? "Více měn – viz export"
              : `${stats.total.toFixed(2)} ${stats.currencies[0] ?? "CZK"}`}
          </strong>
        </div>
        <div className="card stat">
          <span>Průměrná cena</span>
          <strong>
            {multiCurrency
              ? "—"
              : stats.repairs.length
                ? stats.total.div(stats.repairs.length).toFixed(2)
                : "—"}
          </strong>
        </div>
        <div className="card stat">
          <span>Rozdíl proti odhadu</span>
          <strong>
            {multiCurrency ? "—" : stats.total.minus(stats.estimate).toFixed(2)}
          </strong>
        </div>
        <div className="card stat">
          <span>Průměrná doba opravy</span>
          <strong>{stats.averageDays?.toFixed(1) ?? "—"} dní</strong>
        </div>
        <div className="card stat">
          <span>Doba mimo provoz (součet dnů prostředků)</span>
          <strong>{stats.downtimeDays.toFixed(1)}</strong>
        </div>
      </section>
      {!multiCurrency && (
        <>
          <section className="card">
            <h2>Náklady po měsících</h2>
            {[...stats.months].sort().map(([month, cost]) => (
              <div key={month} className="history-row">
                <span>{month}</span>
                <meter
                  min={0}
                  max={Math.max(1, stats.total.toNumber())}
                  value={cost.toNumber()}
                />
                <strong>{cost.toFixed(2)}</strong>
              </div>
            ))}
          </section>
          <section className="card">
            <h2>Náklady podle prostředku, vozidla, kategorie a servisu</h2>
            {[...stats.groups].map(([label, cost]) => (
              <p key={label}>
                {label}: {cost.toFixed(2)}
              </p>
            ))}
          </section>
        </>
      )}
      <section className="card">
        <h2>Nejčastěji opravované prostředky</h2>
        {[...new Set(stats.repairs.map((r) => r.equipmentId))]
          .sort(
            (a, b) =>
              stats.repairs.filter((r) => r.equipmentId === b).length -
              stats.repairs.filter((r) => r.equipmentId === a).length,
          )
          .slice(0, 10)
          .map((id) => (
            <p key={id}>
              <Link href={`/prostredky/${id}`}>
                {stats.equipment.find((e) => e.id === id)?.name}
              </Link>
              : {stats.repairs.filter((r) => r.equipmentId === id).length} oprav
            </p>
          ))}
      </section>
    </ModulePage>
  );
}
