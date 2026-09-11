import Link from "next/link";
import { notFound } from "next/navigation";
import { startInspection } from "@/app/actions/inspection";
import { applyCeproRule } from "@/app/actions/checklist-mapping";
import { InspectionForm } from "@/components/inspection-form";
import { ModulePage } from "@/components/module-page";
import { requireUser } from "@/lib/auth";
import { suggestCeproTarget } from "@/lib/cepro";
import { selectUnambiguousRule } from "@/lib/checklist-matching";
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
  const roles = new Set(user.roles.map((entry) => entry.role.code));
  const canMap = roles.has("ADMIN") || roles.has("TS_ADMIN");
  const target = suggestCeproTarget(
    requirement.equipment.name,
    requirement.equipment.typeName,
  );
  const candidates = target
    ? await prisma.ruleVersion.findMany({
        where: {
          rule: {
            sourceType: "INTERNAL_CEPRO",
            targetKey: target,
            requirementType: "INSPECTION",
            active: true,
          },
          checklistTemplateVersionId: { not: null },
          validTo: null,
        },
        include: { rule: true },
        orderBy: { version: "desc" },
      })
    : [];
  const suggestion = selectUnambiguousRule(requirement, candidates);
  const suggestedChecklist = suggestion?.checklistTemplateVersionId
    ? await prisma.checklistTemplateVersion.findUnique({
        where: { id: suggestion.checklistTemplateVersionId },
        include: { template: true },
      })
    : null;
  if (requirement.sourceType === "LEGACY_IMPORT")
    return (
      <ModulePage
        eyebrow="Kontroly · starší evidence"
        title="Povinnost pochází ze staré evidence"
      >
        <section className="card legacy-mapping">
          <dl>
            <div>
              <dt>Prostředek</dt>
              <dd>
                {requirement.equipment.name} · {requirement.equipment.uid}
              </dd>
            </div>
            <div>
              <dt>Původní povinnost</dt>
              <dd>{requirement.name}</dd>
            </div>
            <div>
              <dt>Nalezené pravidlo ČEPRO</dt>
              <dd>
                {suggestion
                  ? `${suggestion.rule.name} – ${suggestion.intervalValue} ${suggestion.intervalUnit}`
                  : "Shoda není jednoznačná"}
              </dd>
            </div>
            <div>
              <dt>Zdroj</dt>
              <dd>
                {suggestion
                  ? `Metodika HZS ČEPRO${suggestion.article ? `, čl. ${suggestion.article}` : ""}`
                  : "LEGACY_IMPORT"}
              </dd>
            </div>
            <div>
              <dt>Checklist</dt>
              <dd>
                {suggestedChecklist?.template.name ??
                  "Je potřeba vybrat kontrolní šablonu."}
              </dd>
            </div>
          </dl>
          {canMap && suggestion && (
            <form action={applyCeproRule}>
              <input
                type="hidden"
                name="requirementId"
                value={requirement.id}
              />
              <input type="hidden" name="ruleVersionId" value={suggestion.id} />
              <button className="button">Použít pravidlo ČEPRO</button>
            </form>
          )}
          <div className="row-actions">
            {canMap && (
              <Link
                className="button secondary"
                href="/administrace/checklisty/mapovani?stav=LEGACY"
              >
                Vybrat jinou šablonu
              </Link>
            )}
            <Link className="button secondary" href="/kontroly">
              Zrušit
            </Link>
          </div>
          {!suggestion && (
            <p className="reason">
              Je potřeba ruční rozhodnutí. Systém nebude checklist odhadovat.
            </p>
          )}
        </section>
      </ModulePage>
    );
  const checklistVersionId =
    requirement.ruleVersion?.checklistTemplateVersionId;
  if (!checklistVersionId)
    return (
      <ModulePage eyebrow="Kontroly" title="Kontrolu nelze zahájit">
        <div className="card missing-checklist">
          <strong>Chybí kontrolní šablona.</strong>
          <dl>
            <div>
              <dt>Prostředek</dt>
              <dd>
                {requirement.equipment.name} · {requirement.equipment.uid}
              </dd>
            </div>
            <div>
              <dt>Povinnost</dt>
              <dd>{requirement.name}</dd>
            </div>
            <div>
              <dt>Zdroj</dt>
              <dd>
                {requirement.sourceType ?? requirement.source ?? "Neuveden"}
              </dd>
            </div>
            <div>
              <dt>Důvod</dt>
              <dd>Pro tuto povinnost není vytvořena kontrolní šablona.</dd>
            </div>
          </dl>
          <p>Obecný checklist se nepoužije automaticky.</p>
          {canMap && suggestion && (
            <form action={applyCeproRule}>
              <input
                type="hidden"
                name="requirementId"
                value={requirement.id}
              />
              <input type="hidden" name="ruleVersionId" value={suggestion.id} />
              <button className="button">
                Použít doporučenou šablonu {suggestedChecklist?.template.name}
              </button>
            </form>
          )}
          <div className="row-actions">
            {canMap && (
              <Link
                className="button secondary"
                href="/administrace/checklisty/mapovani"
              >
                Vyřešit mapování
              </Link>
            )}
            <Link className="button secondary" href="/kontroly">
              Zpět na kontroly
            </Link>
          </div>
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
