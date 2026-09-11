import Link from "next/link";
import { notFound } from "next/navigation";
import { startInspection } from "@/app/actions/inspection";
import { InspectionForm } from "@/components/inspection-form";
import { ModulePage } from "@/components/module-page";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ requirementId: string }>;
  searchParams: Promise<{ draft?: string; chyba?: string }>;
}) {
  const user = await requireUser();
  const [{ requirementId }, q] = await Promise.all([params, searchParams]);
  const requirement = await prisma.equipmentRequirement.findUnique({
    where: { id: requirementId },
    include: {
      equipment: { include: { vehicle: true, location: true } },
      ruleVersion: { include: { rule: true } },
      sourceRule: true,
    },
  });
  if (
    !requirement ||
    requirement.archivedAt ||
    requirement.type !== "INSPECTION"
  )
    notFound();
  const checklistVersionId =
    requirement.ruleVersion?.checklistTemplateVersionId;
  if (!checklistVersionId)
    return (
      <ModulePage eyebrow="Kontroly" title="Kontrolu nelze zahájit">
        <div className="card missing-checklist">
          <strong>Pro tuto povinnost není vytvořena kontrolní šablona.</strong>
          <p>
            Administrátor musí k pravidlu přiřadit konkrétní verzi checklistu.
            Obecný checklist se nepoužije automaticky.
          </p>
          <Link className="button secondary" href="/kontroly">
            Zpět na kontroly
          </Link>
        </div>
      </ModulePage>
    );
  const existing = await prisma.inspection.findFirst({
    where: {
      inspectorId: user.id,
      equipmentId: requirement.equipmentId,
      requirementId,
      state: "DRAFT",
    },
    orderBy: { startedAt: "desc" },
  });
  const draftId = q.draft ?? existing?.id;
  if (!draftId)
    return (
      <ModulePage eyebrow="Kontroly · krok 2 z 3" title="Ověření prostředku">
        <section className="card identity-check">
          <h2>{requirement.equipment.name}</h2>
          <dl>
            <div>
              <dt>UID</dt>
              <dd>{requirement.equipment.uid}</dd>
            </div>
            <div>
              <dt>Výrobní číslo</dt>
              <dd>{requirement.equipment.serialNumber ?? "—"}</dd>
            </div>
            <div>
              <dt>Evidenční číslo</dt>
              <dd>{requirement.equipment.registrationNumber ?? "—"}</dd>
            </div>
            <div>
              <dt>Původní ID</dt>
              <dd>{requirement.equipment.legacyId ?? "—"}</dd>
            </div>
            <div>
              <dt>Vozidlo / umístění</dt>
              <dd>
                {requirement.equipment.vehicle?.name ??
                  requirement.equipment.location?.name ??
                  "—"}
              </dd>
            </div>
            <div>
              <dt>Povinnost</dt>
              <dd>
                {requirement.name} ·{" "}
                {requirement.performedBy ?? "oprávněná osoba"}
              </dd>
            </div>
          </dl>
          {q.chyba && <div className="error">{q.chyba}</div>}
          <form action={startInspection}>
            <input type="hidden" name="requirementId" value={requirement.id} />
            <label className="confirm-check">
              <input type="checkbox" name="identityVerified" required /> Byla
              ověřena shoda evidenčního nebo výrobního čísla s dokumentací
              prostředku.
            </label>
            <button className="button">Zahájit kontrolu</button>
          </form>
        </section>
      </ModulePage>
    );
  const draft = await prisma.inspection.findFirst({
    where: { id: draftId, inspectorId: user.id, requirementId, state: "DRAFT" },
    include: {
      checklistVersion: {
        include: {
          template: true,
          sections: {
            orderBy: { sortOrder: "asc" },
            include: { items: { orderBy: { sortOrder: "asc" } } },
          },
        },
      },
      responses: true,
    },
  });
  if (!draft) notFound();
  const initial = Object.fromEntries(
    draft.responses.map((r) => {
      const json = r.valueJson as {
        value?: unknown;
        state?: string;
        reason?: string;
      };
      return [r.checklistItemId, { ...json, reason: r.note ?? json.reason }];
    }),
  );
  return (
    <InspectionForm
      draftId={draft.id}
      sections={draft.checklistVersion.sections}
      initial={initial}
      allowLimitation={draft.checklistVersion.allowPassedWithLimitation}
      nonCriticalFailureResult={draft.checklistVersion.nonCriticalFailureResult}
      error={q.chyba}
      header={{
        name: requirement.equipment.name,
        uid: requirement.equipment.uid,
        placement:
          requirement.equipment.vehicle?.name ??
          requirement.equipment.location?.name ??
          "Bez umístění",
        requirement: requirement.name,
        checklist: draft.checklistVersion.template.name,
        version: draft.checklistVersion.version,
      }}
    />
  );
}
