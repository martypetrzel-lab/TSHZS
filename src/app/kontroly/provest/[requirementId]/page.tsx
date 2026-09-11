import Link from "next/link";
import { notFound } from "next/navigation";
import { startInspection } from "@/app/actions/inspection";
import { InspectionForm } from "@/components/inspection-form";
import { ModulePage } from "@/components/module-page";
import { requireUser } from "@/lib/auth";
import { resolveInspectionChecklist } from "@/lib/inspection-checklist";
import { prisma } from "@/lib/prisma";
import {
  canUserPerformInspection,
  inspectionPerformedBy,
} from "@/lib/inspection-permissions";
import { canUseHistoricalDates, todayDateKey } from "@/lib/inspection-lifecycle";

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
  if (!canUserPerformInspection(user, requirement))
    return (
      <ModulePage
        eyebrow="Kontroly"
        title="Tuto činnost nelze provést v aplikaci"
      >
        <div className="card missing-checklist">
          <strong>Tuto kontrolu nemáte oprávnění provést.</strong>
          <p>
            Požadované provedení:{" "}
            {inspectionPerformedBy(requirement) ?? "technik TS"}. Systémová role
            ADMIN sama o sobě nenahrazuje odbornou kvalifikaci ani roli
            technika.
          </p>
          <Link
            className="button secondary"
            href={`/prostredky/${requirement.equipmentId}`}
          >
            Zpět na prostředek
          </Link>
        </div>
      </ModulePage>
    );
  const resolvedChecklist = await resolveInspectionChecklist(
    requirement.ruleVersion?.checklistTemplateVersionId,
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
  const requestedDraft = q.draft
    ? await prisma.inspection.findFirst({ where: { id: q.draft, inspectorId: user.id, requirementId, state: "DRAFT" } })
    : null;
  const draftCandidate = requestedDraft ?? existing;
  const draftId = draftCandidate?.identityVerifiedAt ? draftCandidate.id : undefined;
  if (!draftId)
    return (
      <ModulePage eyebrow="Kontroly · krok 2 z 3" title="Ověření prostředku">
        <section className="card identity-check">
          <h2>{requirement.equipment.name}</h2>
          {resolvedChecklist.fallback && (
            <div className="base-checklist-warning">
              <strong>ZÁKLADNÍ KONTROLNÍ FORMULÁŘ</strong>
              <p>
                Pro tento typ prostředku zatím není vytvořen specializovaný
                checklist. Používá se základní formulář kontroly. Rozsah
                kontroly je nutné provést také podle dokumentace výrobce a
                platných předpisů.
              </p>
            </div>
          )}
          {requirement.sourceType === "LEGACY_IMPORT" && (
            <div className="legacy-checklist-notice">
              Kontrolní povinnost pochází z původní evidence. Používá se
              základní kontrolní formulář, pokud ještě nebyla přiřazena
              specializovaná šablona podle metodiky HZS ČEPRO.
            </div>
          )}
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
            <label className="field">
              <span>Plánované datum kontroly</span>
              <input type="date" name="scheduledFor" required defaultValue={draftCandidate?.scheduledFor?.toISOString().slice(0, 10) ?? todayDateKey()} />
            </label>
            <label className="field">
              <span>Poznámka k plánování</span>
              <textarea name="note" defaultValue={draftCandidate?.note ?? ""} />
            </label>
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
      scheduledFor={draft.scheduledFor?.toISOString().slice(0, 10) ?? todayDateKey()}
      initialNote={draft.note ?? ""}
      canUseHistoricalDates={canUseHistoricalDates(user.roles.map((entry) => entry.role.code))}
      today={todayDateKey()}
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
        fallback:
          draft.checklistVersion.template.seedKey === "cepro:general-ts",
        legacy: requirement.sourceType === "LEGACY_IMPORT",
        legacyId: requirement.equipment.legacyId,
        serialNumber: requirement.equipment.serialNumber,
        registrationNumber: requirement.equipment.registrationNumber,
        location: requirement.equipment.location?.name ?? null,
        interval: `${requirement.intervalValue ?? "—"} ${requirement.intervalUnit ?? ""}`,
        source: requirement.source ?? requirement.sourceType ?? "Neuveden",
        lastCompletedAt:
          requirement.lastCompletedAt?.toLocaleDateString("cs-CZ") ?? "—",
        nextDueAt: requirement.nextDueAt?.toLocaleDateString("cs-CZ") ?? "—",
      }}
    />
  );
}
