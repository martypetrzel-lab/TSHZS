import Link from "next/link";
import { closeInspection } from "@/app/actions/inspection";
import { ModulePage } from "@/components/module-page";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    equipmentId?: string;
    requirementId?: string;
    chyba?: string;
  }>;
}) {
  const q = await searchParams;
  const recent = await prisma.inspection.findMany({
    where: { state: { not: "DRAFT" } },
    include: { equipment: true, requirement: true, protocol: true },
    orderBy: { completedAt: "desc" },
    take: 50,
  });
  const requirement = q.requirementId
    ? await prisma.equipmentRequirement.findUnique({
        where: { id: q.requirementId },
        include: { equipment: true, ruleVersion: true },
      })
    : null;
  let checklistId =
    requirement?.ruleVersion?.checklistTemplateVersionId ?? null;
  if (!checklistId)
    checklistId =
      (
        await prisma.checklistTemplateVersion.findFirst({
          where: { template: { seedKey: "checklist:general" } },
          orderBy: { version: "desc" },
        })
      )?.id ?? null;
  const checklist = checklistId
    ? await prisma.checklistTemplateVersion.findUnique({
        where: { id: checklistId },
        include: {
          template: true,
          sections: {
            orderBy: { sortOrder: "asc" },
            include: { items: { orderBy: { sortOrder: "asc" } } },
          },
        },
      })
    : null;
  return (
    <ModulePage eyebrow="Kontrolní činnost" title="Kontroly">
      {q.chyba && <div className="error import-error">{q.chyba}</div>}
      {requirement && checklist && (
        <form action={closeInspection} className="card inspection-form">
          <input type="hidden" name="requirementId" value={requirement.id} />
          <input type="hidden" name="checklistVersionId" value={checklist.id} />
          <div className="panel-head">
            <div>
              <h2>
                {requirement.name} · {requirement.equipment.name}
              </h2>
              <span>
                {checklist.template.name}, verze {checklist.version}
              </span>
            </div>
          </div>
          {checklist.sections.map((section) => (
            <fieldset key={section.id}>
              <legend>{section.title}</legend>
              {section.items.map((item) => (
                <div className="inspection-item" key={item.id}>
                  <label>
                    <strong>
                      {item.label}
                      {item.required && " *"}
                    </strong>
                    {item.responseType === "MEASUREMENT" ? (
                      <input
                        type="number"
                        step="any"
                        name={`answer-${item.id}`}
                        required
                      />
                    ) : (
                      <select name={`answer-${item.id}`} required>
                        <option value="">Vyberte</option>
                        <option value="VYHOVUJE">Vyhovuje</option>
                        <option value="NEVYHOVUJE">Nevyhovuje</option>
                      </select>
                    )}
                  </label>
                  {item.allowNotApplicable && (
                    <label>
                      <input type="checkbox" name={`na-${item.id}`} />{" "}
                      NERELEVANTNÍ
                    </label>
                  )}
                  <input
                    name={`reason-${item.id}`}
                    placeholder="Důvod / poznámka"
                  />
                </div>
              ))}
            </fieldset>
          ))}
          <div className="form-grid inspection-result">
            <label className="field">
              <span>Výsledek</span>
              <select name="result" required>
                <option value="PASSED">Vyhovuje</option>
                <option value="PASSED_WITH_LIMITATION">
                  Vyhovuje s omezením
                </option>
                <option value="FAILED">Nevyhovuje</option>
              </select>
            </label>
            <label className="review-check">
              <input type="checkbox" name="criticalParameterFailed" /> Nesplněn
              kritický parametr – mimo provoz
            </label>
            <label className="field full">
              <span>Poznámka</span>
              <textarea name="note" />
            </label>
          </div>
          <div className="form-actions">
            <button className="button">
              Uzavřít a vytvořit neměnný protokol
            </button>
          </div>
        </form>
      )}
      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Prostředek</th>
              <th>Povinnost</th>
              <th>Výsledek</th>
              <th>Protokol</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((i) => (
              <tr key={i.id}>
                <td>{i.completedAt?.toLocaleDateString("cs-CZ") ?? "—"}</td>
                <td>
                  <Link href={`/prostredky/${i.equipmentId}`}>
                    {i.equipment.name}
                  </Link>
                </td>
                <td>{i.requirement?.name ?? i.inspectionType}</td>
                <td>{i.result}</td>
                <td>{i.protocol?.number ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ModulePage>
  );
}
