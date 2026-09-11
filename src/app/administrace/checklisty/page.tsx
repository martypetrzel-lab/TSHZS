import Link from "next/link";
import { ModulePage } from "@/components/module-page";
import { requireImportAdministrator } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireImportAdministrator();
  const [templates, ruleVersions, requirements] = await Promise.all([
    prisma.checklistTemplate.findMany({
      include: { versions: { orderBy: { version: "desc" } } },
      orderBy: { name: "asc" },
    }),
    prisma.ruleVersion.findMany({
      where: { checklistTemplateVersionId: { not: null } },
      include: { rule: true },
    }),
    prisma.equipmentRequirement.findMany({
      where: { archivedAt: null, ruleVersionId: { not: null } },
      select: { equipmentId: true, ruleVersionId: true },
    }),
  ]);
  return (
    <ModulePage eyebrow="Administrace" title="Checklisty">
      <div className="page-actions">
        <Link className="button" href="/administrace/checklisty/mapovani">
          Mapování povinností
        </Link>
        <Link className="button secondary" href="/administrace/kontrola-dat">
          Kontrola dat
        </Link>
      </div>
      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Šablona</th>
              <th>Verze</th>
              <th>Zdroj</th>
              <th>Používá ji pravidel</th>
              <th>Používá ji prostředků</th>
              <th>Stav</th>
              <th>Akce</th>
            </tr>
          </thead>
          <tbody>
            {templates.flatMap((template) =>
              template.versions.map((version) => {
                const rules = ruleVersions.filter(
                  (rv) => rv.checklistTemplateVersionId === version.id,
                );
                const ruleIds = new Set(rules.map((rv) => rv.id));
                const equipment = new Set(
                  requirements
                    .filter(
                      (r) => r.ruleVersionId && ruleIds.has(r.ruleVersionId),
                    )
                    .map((r) => r.equipmentId),
                );
                return (
                  <tr key={version.id}>
                    <td>
                      <strong>{template.name}</strong>
                      <small>{template.seedKey ?? "Vlastní šablona"}</small>
                    </td>
                    <td>{version.version}</td>
                    <td>
                      {template.seedKey?.startsWith("cepro:")
                        ? "Metodika HZS ČEPRO"
                        : "Vlastní"}
                    </td>
                    <td>{rules.length}</td>
                    <td>{equipment.size}</td>
                    <td>
                      <span
                        className={`badge ${template.active && !version.validTo ? "" : "neutral"}`}
                      >
                        {template.active && !version.validTo
                          ? "Aktivní"
                          : "Neaktivní"}
                      </span>
                    </td>
                    <td>
                      <Link
                        href={`/administrace/checklisty/mapovani?checklist=${version.id}`}
                      >
                        Použít při mapování
                      </Link>
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
    </ModulePage>
  );
}
