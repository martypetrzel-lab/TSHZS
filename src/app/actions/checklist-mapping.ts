"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireImportAdministrator } from "@/lib/authorization";
import { checklistMappingRows } from "@/lib/checklist-reconciliation";
import { prisma } from "@/lib/prisma";

async function audit(
  userId: string,
  requirementId: string,
  previousValue: unknown,
  newValue: unknown,
  reason: string,
) {
  await prisma.auditLog.create({
    data: {
      userId,
      action: "CHECKLIST_MAPPING_CHANGED",
      entityType: "EquipmentRequirement",
      entityId: requirementId,
      previousValue: previousValue as never,
      newValue: newValue as never,
      reason,
    },
  });
}

export async function applyCeproRule(formData: FormData) {
  const user = await requireImportAdministrator();
  const requirementId = String(formData.get("requirementId") ?? "");
  const ruleVersionId = String(formData.get("ruleVersionId") ?? "");
  const [legacy, version] = await Promise.all([
    prisma.equipmentRequirement.findUnique({ where: { id: requirementId } }),
    prisma.ruleVersion.findFirst({
      where: {
        id: ruleVersionId,
        checklistTemplateVersionId: { not: null },
        rule: {
          sourceType: "INTERNAL_CEPRO",
          requirementType: "INSPECTION",
          active: true,
        },
      },
      include: { rule: true },
    }),
  ]);
  if (!legacy || !version)
    redirect(
      `/administrace/checklisty/mapovani?chyba=${encodeURIComponent("Vybrané pravidlo nebo povinnost neexistuje.")}`,
    );
  const existing = await prisma.equipmentRequirement.findFirst({
    where: {
      equipmentId: legacy.equipmentId,
      ruleVersionId: version.id,
      archivedAt: null,
    },
  });
  const replacement =
    existing ??
    (await prisma.equipmentRequirement.create({
      data: {
        equipmentId: legacy.equipmentId,
        ruleVersionId: version.id,
        sourceRuleId: version.ruleId,
        type: "INSPECTION",
        name: version.rule.name,
        intervalValue: version.intervalValue,
        intervalUnit: version.intervalUnit,
        trigger: version.trigger,
        performedBy: version.performedBy,
        lastCompletedAt: legacy.lastCompletedAt,
        nextDueAt: legacy.nextDueAt,
        source: version.rule.name,
        sourceType: "INTERNAL_CEPRO",
        status: legacy.status,
      },
    }));
  if (legacy.sourceType === "LEGACY_IMPORT")
    await prisma.equipmentRequirement.update({
      where: { id: legacy.id },
      data: {
        archivedAt: new Date(),
        manuallyResolved: true,
        resolutionReason: `Nahrazeno pravidlem ČEPRO; nová povinnost ${replacement.id}. Historie zachována.`,
      },
    });
  else
    await prisma.equipmentRequirement.update({
      where: { id: legacy.id },
      data: { ruleVersionId: version.id, sourceRuleId: version.ruleId },
    });
  await audit(
    user.id,
    legacy.id,
    { ruleVersionId: legacy.ruleVersionId, archivedAt: legacy.archivedAt },
    {
      replacementRequirementId: replacement.id,
      ruleVersionId: version.id,
      checklistTemplateVersionId: version.checklistTemplateVersionId,
    },
    "Potvrzené mapování na pravidlo HZS ČEPRO",
  );
  revalidatePath("/kontroly");
  revalidatePath("/administrace/checklisty");
  revalidatePath("/administrace/checklisty/mapovani");
  revalidatePath("/administrace/kontrola-dat");
  redirect(`/kontroly/provest/${replacement.id}`);
}

export async function assignChecklist(formData: FormData) {
  const user = await requireImportAdministrator();
  const requirementId = String(formData.get("requirementId") ?? "");
  const checklistVersionId = String(formData.get("checklistVersionId") ?? "");
  const requirement = await prisma.equipmentRequirement.findUnique({
    where: { id: requirementId },
    include: { ruleVersion: true },
  });
  const checklist = await prisma.checklistTemplateVersion.findUnique({
    where: { id: checklistVersionId },
  });
  if (!requirement || !checklist)
    redirect("/administrace/checklisty/mapovani?chyba=Neplatné mapování");
  let ruleVersionId = requirement.ruleVersionId;
  if (requirement.ruleVersion) {
    const used = await prisma.ruleVersion.findFirst({
      where: {
        id: requirement.ruleVersion.id,
        OR: [
          { protocolRules: { some: {} } },
          {
            requirements: {
              some: {
                inspections: {
                  some: { state: { in: ["CLOSED", "CANCELLED", "CORRECTED"] } },
                },
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    if (!used)
      await prisma.ruleVersion.update({
        where: { id: requirement.ruleVersion.id },
        data: { checklistTemplateVersionId: checklistVersionId },
      });
    else {
      const latest = await prisma.ruleVersion.findFirst({
        where: { ruleId: requirement.ruleVersion.ruleId },
        orderBy: { version: "desc" },
      });
      const created = await prisma.ruleVersion.create({
        data: {
          ruleId: requirement.ruleVersion.ruleId,
          version: (latest?.version ?? 0) + 1,
          validFrom: new Date(),
          intervalValue: requirement.ruleVersion.intervalValue,
          intervalUnit: requirement.ruleVersion.intervalUnit,
          trigger: requirement.ruleVersion.trigger,
          performedBy: requirement.ruleVersion.performedBy,
          article: requirement.ruleVersion.article,
          note: "Nová verze vytvořená ručním mapováním checklistu.",
          checklistTemplateVersionId: checklistVersionId,
        },
      });
      ruleVersionId = created.id;
      await prisma.equipmentRequirement.update({
        where: { id: requirement.id },
        data: { ruleVersionId },
      });
    }
  } else {
    const rule = await prisma.rule.create({
      data: {
        name: `Ruční checklist – ${requirement.name}`,
        requirementType: "INSPECTION",
        sourceType: "INDIVIDUAL",
        equipmentId: requirement.equipmentId,
        active: true,
      },
    });
    const version = await prisma.ruleVersion.create({
      data: {
        ruleId: rule.id,
        version: 1,
        validFrom: new Date(),
        intervalValue: requirement.intervalValue,
        intervalUnit: requirement.intervalUnit,
        trigger: requirement.trigger,
        performedBy: requirement.performedBy,
        checklistTemplateVersionId: checklistVersionId,
      },
    });
    ruleVersionId = version.id;
    await prisma.equipmentRequirement.update({
      where: { id: requirement.id },
      data: { ruleVersionId, sourceRuleId: rule.id, needsReview: false },
    });
  }
  await audit(
    user.id,
    requirement.id,
    { ruleVersionId: requirement.ruleVersionId },
    { ruleVersionId, checklistTemplateVersionId: checklistVersionId },
    "Ruční přiřazení kontrolní šablony",
  );
  revalidatePath("/administrace/checklisty/mapovani");
  revalidatePath("/administrace/kontrola-dat");
  revalidatePath("/kontroly");
}

export async function postponeChecklistMapping(formData: FormData) {
  const user = await requireImportAdministrator();
  const requirementId = String(formData.get("requirementId") ?? "");
  const requirement = await prisma.equipmentRequirement.update({
    where: { id: requirementId },
    data: {
      needsReview: true,
      resolutionReason: "Kontrolní šablona bude doplněna později.",
    },
  });
  await audit(
    user.id,
    requirement.id,
    null,
    { needsReview: true },
    "Mapování odloženo administrátorem",
  );
  revalidatePath("/administrace/checklisty/mapovani");
  revalidatePath("/administrace/kontrola-dat");
}

export async function applyAllUnambiguousMappings() {
  const user = await requireImportAdministrator();
  const rows = (await checklistMappingRows()).filter(
    (row) => row.status !== "PŘIŘAZENO" && row.suggestion,
  );
  let changed = 0;
  for (const { requirement, suggestion } of rows) {
    if (!suggestion) continue;
    if (requirement.sourceType === "LEGACY_IMPORT") {
      const existing = await prisma.equipmentRequirement.findFirst({
        where: {
          equipmentId: requirement.equipmentId,
          ruleVersionId: suggestion.id,
          archivedAt: null,
        },
      });
      const replacement =
        existing ??
        (await prisma.equipmentRequirement.create({
          data: {
            equipmentId: requirement.equipmentId,
            ruleVersionId: suggestion.id,
            sourceRuleId: suggestion.ruleId,
            type: "INSPECTION",
            name: suggestion.rule.name,
            intervalValue: suggestion.intervalValue,
            intervalUnit: suggestion.intervalUnit,
            trigger: suggestion.trigger,
            performedBy: suggestion.performedBy,
            lastCompletedAt: requirement.lastCompletedAt,
            nextDueAt: requirement.nextDueAt,
            source: suggestion.rule.name,
            sourceType: "INTERNAL_CEPRO",
            status: requirement.status,
          },
        }));
      await prisma.equipmentRequirement.update({
        where: { id: requirement.id },
        data: {
          archivedAt: new Date(),
          manuallyResolved: true,
          resolutionReason: `Hromadně nahrazeno pravidlem ČEPRO; nová povinnost ${replacement.id}. Historie zachována.`,
        },
      });
    } else
      await prisma.equipmentRequirement.update({
        where: { id: requirement.id },
        data: { ruleVersionId: suggestion.id, sourceRuleId: suggestion.ruleId },
      });
    await audit(
      user.id,
      requirement.id,
      { ruleVersionId: requirement.ruleVersionId },
      {
        ruleVersionId: suggestion.id,
        checklistTemplateVersionId: suggestion.checklistTemplateVersionId,
      },
      "Hromadné jednoznačné mapování checklistů",
    );
    changed++;
  }
  revalidatePath("/kontroly");
  revalidatePath("/administrace/checklisty/mapovani");
  revalidatePath("/administrace/kontrola-dat");
  redirect(`/administrace/checklisty/mapovani?hotovo=${changed}`);
}
