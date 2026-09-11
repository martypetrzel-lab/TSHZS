import Link from "next/link";
import {
  applyAllUnambiguousMappings,
  applyCeproRule,
  assignChecklist,
  postponeChecklistMapping,
} from "@/app/actions/checklist-mapping";
import { ModulePage } from "@/components/module-page";
import { requireImportAdministrator } from "@/lib/authorization";
import { checklistMappingRows } from "@/lib/checklist-reconciliation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ stav?: string; chyba?: string; hotovo?: string }>;
}) {
  await requireImportAdministrator();
  const q = await searchParams;
  const [rows, checklists] = await Promise.all([
    checklistMappingRows(),
    prisma.checklistTemplateVersion.findMany({
      where: { template: { active: true }, validTo: null },
      include: { template: true },
      orderBy: [{ template: { name: "asc" } }, { version: "desc" }],
    }),
  ]);
  const filtered = q.stav ? rows.filter((row) => row.status === q.stav) : rows;
  return (
    <ModulePage
      eyebrow="Administrace checklistů"
      title="Mapování kontrolních povinností"
    >
      {q.chyba && <div className="error import-error">{q.chyba}</div>}
      {q.hotovo && (
        <div className="result-banner success">
          Hromadně bylo opraveno {q.hotovo} jednoznačných vazeb.
        </div>
      )}
      <div className="page-actions">
        <Link className="button secondary" href="/administrace/checklisty">
          Přehled šablon
        </Link>
        <form action={applyAllUnambiguousMappings}>
          <button className="button">
            Použít všechna jednoznačná doporučení
          </button>
        </form>
        {["PŘIŘAZENO", "CHYBÍ CHECKLIST", "LEGACY", "KONFLIKT"].map(
          (status) => (
            <Link
              className="button secondary"
              href={`?stav=${encodeURIComponent(status)}`}
              key={status}
            >
              {status} ({rows.filter((r) => r.status === status).length})
            </Link>
          ),
        )}
      </div>
      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Prostředek</th>
              <th>UID</th>
              <th>Povinnost</th>
              <th>Zdroj</th>
              <th>Pravidlo</th>
              <th>Checklist</th>
              <th>Stav</th>
              <th>Akce</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(
              ({ requirement, checklist, suggestion, candidates, status }) => (
                <tr key={requirement.id}>
                  <td>
                    <Link href={`/prostredky/${requirement.equipmentId}`}>
                      {requirement.equipment.name}
                    </Link>
                  </td>
                  <td>{requirement.equipment.uid}</td>
                  <td>{requirement.name}</td>
                  <td>{requirement.sourceType ?? "—"}</td>
                  <td>
                    {requirement.ruleVersion?.rule.name ??
                      requirement.sourceRule?.name ??
                      "—"}
                  </td>
                  <td>
                    {checklist
                      ? `${checklist.template.name}, v${checklist.version}`
                      : "—"}
                  </td>
                  <td>
                    <span
                      className={`badge ${status === "PŘIŘAZENO" ? "" : status === "KONFLIKT" ? "danger" : "warn"}`}
                    >
                      {status}
                    </span>
                  </td>
                  <td>
                    <div className="mapping-actions">
                      {suggestion && (
                        <form action={applyCeproRule}>
                          <input
                            type="hidden"
                            name="requirementId"
                            value={requirement.id}
                          />
                          <input
                            type="hidden"
                            name="ruleVersionId"
                            value={suggestion.id}
                          />
                          <button className="button">
                            Použít {suggestion.rule.name}
                          </button>
                        </form>
                      )}
                      <form action={assignChecklist}>
                        <input
                          type="hidden"
                          name="requirementId"
                          value={requirement.id}
                        />
                        <select
                          name="checklistVersionId"
                          required
                          defaultValue=""
                        >
                          <option value="">Vybrat jinou šablonu</option>
                          {checklists.map((version) => (
                            <option value={version.id} key={version.id}>
                              {version.template.name}, v{version.version}
                            </option>
                          ))}
                        </select>
                        <button className="button secondary">Přiřadit</button>
                      </form>
                      <form action={postponeChecklistMapping}>
                        <input
                          type="hidden"
                          name="requirementId"
                          value={requirement.id}
                        />
                        <button className="button secondary">
                          Doplnit později
                        </button>
                      </form>
                      {!suggestion && candidates.length > 1 && (
                        <small>
                          Více možných pravidel – vyžaduje ruční rozhodnutí.
                        </small>
                      )}
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </ModulePage>
  );
}
