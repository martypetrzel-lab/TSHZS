import { applyCeproMethodology } from "@/app/actions/cepro";
import { ModulePage } from "@/components/module-page";
import { intervalLabel, suggestCeproTarget } from "@/lib/cepro";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ chyba?: string }>;
}) {
  const query = await searchParams;
  const items = await prisma.equipmentItem.findMany({
    where: {
      archivedAt: null,
      requirements: { some: { sourceType: "LEGACY_IMPORT", archivedAt: null } },
    },
    include: {
      requirements: { where: { archivedAt: null }, orderBy: { name: "asc" } },
    },
    orderBy: { name: "asc" },
    take: 200,
  });
  const rules = await prisma.rule.findMany({
    where: { sourceType: "INTERNAL_CEPRO", active: true },
    include: { versions: { where: { validTo: null }, take: 1 } },
  });
  const byTarget = Map.groupBy(rules, (r) => r.targetKey ?? "");
  return (
    <ModulePage
      eyebrow="Kontrola souladu"
      title="Porovnání importovaných povinností s metodikou ČEPRO"
    >
      {query.chyba && <div className="error import-error">{query.chyba}</div>}
      <div className="result-banner">
        Návrh podle názvu slouží jen pro náhled. Bez výslovného potvrzení se nic
        nemění a historické protokoly se nikdy nemažou.
      </div>
      <div className="comparison-list">
        {items.map((item) => {
          const target = suggestCeproTarget(item.name, item.typeName);
          const proposed = target ? (byTarget.get(target) ?? []) : [];
          return (
            <section className="card comparison-card" key={item.id}>
              <div className="section-head">
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.uid}</span>
                </div>
                <span className={`badge ${target ? "warn" : "danger"}`}>
                  {target ? "NESOULAD / KONTROLA" : "VYŽADUJE DOPLNĚNÍ"}
                </span>
              </div>
              <div className="comparison-columns">
                <div>
                  <h3>Legacy</h3>
                  {item.requirements
                    .filter((r) => r.sourceType === "LEGACY_IMPORT")
                    .map((r) => (
                      <p key={r.id}>
                        {r.name} ·{" "}
                        {intervalLabel(r.intervalValue, r.intervalUnit)}
                      </p>
                    ))}
                </div>
                <div>
                  <h3>Metodika ČEPRO</h3>
                  {proposed.length ? (
                    proposed.map((r) => {
                      const v = r.versions[0];
                      return (
                        <p key={r.id}>
                          {r.name} ·{" "}
                          {v
                            ? intervalLabel(
                                v.intervalValue,
                                v.intervalUnit,
                                v.trigger,
                              )
                            : "—"}
                        </p>
                      );
                    })
                  ) : (
                    <p>Nebyla jednoznačně navržena kategorie.</p>
                  )}
                </div>
              </div>
              {target && (
                <form
                  action={applyCeproMethodology}
                  className="comparison-actions"
                >
                  <input type="hidden" name="equipmentId" value={item.id} />
                  <input type="hidden" name="targetKey" value={target} />
                  <input type="hidden" name="previewConfirmed" value="yes" />
                  <input
                    name="reason"
                    required
                    placeholder="Důvod rozhodnutí"
                  />
                  <button className="button secondary" name="mode" value="add">
                    Ponechat legacy + přidat metodiku
                  </button>
                  <button className="button" name="mode" value="replace">
                    Použít metodiku ČEPRO
                  </button>
                </form>
              )}
            </section>
          );
        })}
        {!items.length && (
          <div className="card empty-state">
            <strong>Žádné legacy povinnosti k porovnání.</strong>
          </div>
        )}
      </div>
    </ModulePage>
  );
}
