"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEquipmentEditor } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { addCalendarInterval, nextOperatingThreshold } from "@/lib/rule-engine";
import {
  equipmentOutcome,
  validateChecklistCompletion,
} from "@/lib/inspection-records";

export async function closeInspection(formData: FormData) {
  const user = await requireEquipmentEditor(),
    requirementId = String(formData.get("requirementId") ?? ""),
    checklistVersionId = String(formData.get("checklistVersionId") ?? ""),
    result = String(formData.get("result") ?? "") as
      "PASSED" | "FAILED" | "PASSED_WITH_LIMITATION";
  if (
    !requirementId ||
    !checklistVersionId ||
    !["PASSED", "FAILED", "PASSED_WITH_LIMITATION"].includes(result)
  )
    redirect(`/kontroly?chyba=Neplatné+zadání`);
  const requirement = await prisma.equipmentRequirement.findUnique({
    where: { id: requirementId },
    include: {
      equipment: true,
      ruleVersion: { include: { rule: true } },
      sourceRule: true,
    },
  });
  if (!requirement) redirect("/kontroly?chyba=Povinnost+neexistuje");
  const version = await prisma.checklistTemplateVersion.findUnique({
    where: { id: checklistVersionId },
    include: {
      template: true,
      sections: {
        orderBy: { sortOrder: "asc" },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
  if (!version)
    redirect(
      `/kontroly?equipmentId=${requirement.equipmentId}&requirementId=${requirement.id}&chyba=Checklist+neexistuje`,
    );
  const items = version.sections.flatMap((s) => s.items);
  const answers = items.map((item) => {
    const raw = String(formData.get(`answer-${item.id}`) ?? "").trim(),
      na = formData.get(`na-${item.id}`) === "on",
      reason = String(formData.get(`reason-${item.id}`) ?? "");
    return {
      item,
      required: item.required,
      allowNotApplicable: item.allowNotApplicable,
      value: raw || undefined,
      notApplicable: na,
      reason,
    };
  });
  const validation = validateChecklistCompletion(answers);
  if (!validation.valid)
    redirect(
      `/kontroly?equipmentId=${requirement.equipmentId}&requirementId=${requirement.id}&chyba=${encodeURIComponent("Vyplňte všechny povinné pracovní parametry; NERELEVANTNÍ vyžaduje povolení a důvod.")}`,
    );
  const now = new Date(),
    outcome = equipmentOutcome(
      result,
      formData.get("criticalParameterFailed") === "on",
    );
  let nextDueAt: Date | null = null,
    nextOperatingHours: number | null = null,
    nextUsageCount: number | null = null;
  if (
    result !== "FAILED" &&
    requirement.intervalValue &&
    requirement.trigger === "PERIODIC"
  ) {
    if (
      requirement.intervalUnit &&
      ["DAYS", "WEEKS", "MONTHS", "YEARS"].includes(requirement.intervalUnit)
    )
      nextDueAt = addCalendarInterval(
        now,
        requirement.intervalValue,
        requirement.intervalUnit as "DAYS" | "WEEKS" | "MONTHS" | "YEARS",
      );
    else if (requirement.intervalUnit === "OPERATING_HOURS")
      nextOperatingHours = nextOperatingThreshold(
        Number(requirement.equipment.currentOperatingHours ?? 0),
        requirement.intervalValue,
      );
    else if (requirement.intervalUnit === "USAGE_COUNT")
      nextUsageCount =
        requirement.equipment.usageCount + requirement.intervalValue;
  }
  const inspectionId = randomUUID(),
    protocolId = randomUUID(),
    number = `TSHZS-${now.getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const snapshot = {
    equipment: {
      id: requirement.equipment.id,
      uid: requirement.equipment.uid,
      name: requirement.equipment.name,
    },
    requirement: {
      id: requirement.id,
      name: requirement.name,
      source: requirement.source,
      type: requirement.type,
    },
    checklist: {
      id: version.id,
      name: version.template.name,
      version: version.version,
    },
    answers: answers.map((a) => ({
      checklistItemId: a.item.id,
      label: a.item.label,
      value: a.notApplicable ? "NERELEVANTNÍ" : a.value,
      reason: a.reason || null,
    })),
    result,
    completedAt: now.toISOString(),
  };
  await prisma.$transaction(async (tx) => {
    await tx.inspection.create({
      data: {
        id: inspectionId,
        equipmentId: requirement.equipmentId,
        requirementId: requirement.id,
        inspectorId: user.id,
        checklistVersionId: version.id,
        inspectionType: requirement.name,
        level: "PROFESSIONAL",
        state: "CLOSED",
        result,
        completedAt: now,
        note: String(formData.get("note") ?? "") || null,
        snapshot,
        responses: {
          create: answers.map((a) => ({
            checklistItemId: a.item.id,
            valueJson: a.notApplicable
              ? { state: "NERELEVANTNI", reason: a.reason }
              : { value: a.value },
            note: a.reason || null,
          })),
        },
      },
    });
    await tx.protocol.create({
      data: {
        id: protocolId,
        number,
        inspectionId,
        equipmentId: requirement.equipmentId,
        snapshot,
        rules: requirement.ruleVersionId
          ? {
              create: {
                ruleVersionId: requirement.ruleVersionId,
                snapshot: {
                  ruleId: requirement.sourceRuleId,
                  name: requirement.name,
                  source: requirement.source,
                  intervalValue: requirement.intervalValue,
                  intervalUnit: requirement.intervalUnit,
                },
              },
            }
          : undefined,
      },
    });
    await tx.equipmentRequirementHistory.create({
      data: {
        requirementId: requirement.id,
        lastCompletedAt: now,
        nextDueAt,
        intervalValue: requirement.intervalValue,
        intervalUnit: requirement.intervalUnit,
        status: outcome.createDefect ? "OVERDUE_BLOCKED" : "COMPLIANT",
        source: requirement.source,
        note: `Uzavřen protokol ${number}`,
        recordedById: user.id,
      },
    });
    await tx.equipmentRequirement.update({
      where: { id: requirement.id },
      data: {
        lastCompletedAt: now,
        nextDueAt,
        nextOperatingHours,
        nextUsageCount,
        status: outcome.createDefect ? "OVERDUE_BLOCKED" : "COMPLIANT",
      },
    });
    if (outcome.createDefect) {
      await tx.defect.create({
        data: {
          equipmentId: requirement.equipmentId,
          inspectionId,
          reportedById: user.id,
          description: `Nevyhovující výsledek: ${requirement.name}`,
          severity: "CRITICAL",
        },
      });
      await tx.equipmentItem.update({
        where: { id: requirement.equipmentId },
        data: { status: "OUT_OF_SERVICE", complianceStatus: "OVERDUE_BLOCKED" },
      });
    }
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "INSPECTION_CLOSED",
        entityType: "Inspection",
        entityId: inspectionId,
        newValue: { protocolId, requirementId, result },
        reason: "Uzavření odborné kontroly",
      },
    });
  });
  revalidatePath(`/prostredky/${requirement.equipmentId}`);
  revalidatePath("/kontroly");
  revalidatePath("/protokoly");
  redirect(`/prostredky/${requirement.equipmentId}?protokol=${protocolId}`);
}
