"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { requireInspectionOperator } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { nextOperatingThreshold } from "@/lib/rule-engine";
import {
  calculateInspectionResult,
  isFailedAnswer,
  validateChecklistCompletion,
  type ChecklistAnswer,
} from "@/lib/inspection-records";
import { getStorage } from "@/lib/storage";
import { resolveInspectionChecklist } from "@/lib/inspection-checklist";
import { canUserPerformInspection } from "@/lib/inspection-permissions";
import {
  canUseHistoricalDates,
  dateKey,
  nextDueFromPerformedAt,
  parseDateOnly,
  protocolCounterKey,
  todayDateKey,
  restoreRequirementFromValidInspections,
} from "@/lib/inspection-lifecycle";

const detailInclude = {
  equipment: { include: { vehicle: true, location: true, category: true } },
  ruleVersion: { include: { rule: { include: { sourceDocument: true } } } },
  sourceRule: { include: { sourceDocument: true } },
} as const;

function levelFor(performedBy?: string | null) {
  return performedBy?.toLocaleLowerCase("cs").includes("uživatel")
    ? ("USER" as const)
    : ("PROFESSIONAL" as const);
}

function assertAuthorized(
  user: Awaited<ReturnType<typeof requireInspectionOperator>>,
  requirement: {
    performedBy: string | null;
    ruleVersion: { qualificationId: string | null } | null;
  },
) {
  if (!canUserPerformInspection(user, requirement))
    throw new Error(
      "Tuto kontrolu nemůžete provést. Vyžaduje oprávněného technika, platnou kvalifikaci nebo externí odborný subjekt.",
    );
}

async function loadRequirement(id: string) {
  const requirement = await prisma.equipmentRequirement.findUnique({
    where: { id },
    include: detailInclude,
  });
  if (
    !requirement ||
    requirement.archivedAt ||
    requirement.type !== "INSPECTION"
  )
    throw new Error("Kontrolní povinnost neexistuje nebo není aktivní.");
  return requirement;
}

export async function startInspection(formData: FormData) {
  const user = await requireInspectionOperator();
  const requirementId = String(formData.get("requirementId") ?? "");
  const identityVerified = formData.get("identityVerified") === "on";
  const scheduledFor = parseDateOnly(
    formData.get("scheduledFor") || todayDateKey(),
    "Plánované datum kontroly",
  );
  const note = String(formData.get("note") ?? "").trim();
  if (!identityVerified)
    redirect(
      `/kontroly/provest/${requirementId}?chyba=${encodeURIComponent("Nejprve potvrďte ověření identifikace prostředku.")}`,
    );
  try {
    const requirement = await loadRequirement(requirementId);
    assertAuthorized(user, requirement);
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
    });
    if (existing) {
      await prisma.$transaction(async (tx) => {
        await tx.inspection.update({
          where: { id: existing.id },
          data: { identityVerifiedAt: new Date(), scheduledFor, note: note || existing.note },
        });
        await tx.auditLog.create({ data: { userId: user.id, action: "INSPECTION_STARTED", entityType: "Inspection", entityId: existing.id, newValue: { identityVerifiedAt: new Date().toISOString() } } });
      });
      redirect(`/kontroly/provest/${requirementId}?draft=${existing.id}`);
    }
    const draft = await prisma.$transaction(async (tx) => {
      const created = await tx.inspection.create({
        data: {
          equipmentId: requirement.equipmentId,
          requirementId,
          inspectorId: user.id,
          checklistVersionId: resolvedChecklist.checklistVersionId,
          inspectionType: requirement.name,
          level: levelFor(requirement.performedBy),
          identityVerifiedAt: new Date(),
          scheduledFor,
          note: note || null,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "INSPECTION_STARTED",
          entityType: "Inspection",
          entityId: created.id,
          newValue: {
            equipmentId: requirement.equipmentId,
            requirementId,
            fallbackChecklist: resolvedChecklist.fallback,
            scheduledFor: scheduledFor.toISOString(),
          },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "INSPECTION_SCHEDULED",
          entityType: "Inspection",
          entityId: created.id,
          newValue: { scheduledFor: scheduledFor.toISOString(), note: note || null },
        },
      });
      return created;
    });
    redirect(`/kontroly/provest/${requirementId}?draft=${draft.id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(
      `/kontroly/provest/${requirementId}?chyba=${encodeURIComponent(error instanceof Error ? error.message : "Kontrolu nelze zahájit.")}`,
    );
  }
}

async function draftContext(draftId: string, userId: string) {
  const draft = await prisma.inspection.findUnique({
    where: { id: draftId },
    include: {
      requirement: { include: detailInclude },
      checklistVersion: {
        include: {
          template: true,
          sections: {
            orderBy: { sortOrder: "asc" as const },
            include: { items: { orderBy: { sortOrder: "asc" as const } } },
          },
        },
      },
      responses: true,
    },
  });
  if (
    !draft ||
    draft.state !== "DRAFT" ||
    draft.inspectorId !== userId ||
    !draft.requirement
  )
    throw new Error(
      "Rozpracovaná kontrola neexistuje nebo k ní nemáte přístup.",
    );
  return draft;
}

function answerData(
  formData: FormData,
  item: {
    id: string;
    label: string;
    responseType: string;
    required: boolean;
    allowNotApplicable: boolean;
    naRequiresReason: boolean;
    failRequiresNote: boolean;
    failRequiresPhoto: boolean;
    failCreatesDefect: boolean;
    critical: boolean;
    optionsJson: unknown;
  },
) {
  const raw = formData.get(`answer-${item.id}`);
  const na = formData.get(`na-${item.id}`) === "on";
  const reason = String(formData.get(`reason-${item.id}`) ?? "").trim();
  let value: unknown = raw == null ? undefined : String(raw).trim();
  if (item.responseType === "NUMBER" || item.responseType === "MEASUREMENT")
    value = value === "" ? undefined : Number(value);
  if (item.responseType === "BOOLEAN")
    value = value === "true" ? true : value === "false" ? false : undefined;
  const limits = item.optionsJson as {
    failWhen?: unknown;
    min?: number;
    max?: number;
    targetMin?: number;
  } | null;
  const numberValue = typeof value === "number" ? value : null;
  const failed =
    numberValue != null &&
    ((limits?.min != null && numberValue < limits.min) ||
      (limits?.targetMin != null && numberValue < limits.targetMin) ||
      (limits?.max != null && numberValue > limits.max));
  return {
    id: item.id,
    label: item.label,
    responseType: item.responseType,
    required: item.required,
    allowNotApplicable: item.allowNotApplicable,
    naRequiresReason: item.naRequiresReason,
    failRequiresNote: item.failRequiresNote,
    failRequiresPhoto: item.failRequiresPhoto,
    failCreatesDefect: item.failCreatesDefect,
    critical: item.critical,
    failureValue: limits?.failWhen,
    failed,
    value,
    notApplicable: na,
    reason,
  } satisfies ChecklistAnswer;
}

async function persistDraft(
  draftId: string,
  userId: string,
  formData: FormData,
  audit = true,
) {
  const draft = await draftContext(draftId, userId);
  const items = draft.checklistVersion.sections.flatMap((s) => s.items);
  const answers = items.map((item) => answerData(formData, item));
  for (const answer of answers) {
    const files = formData
      .getAll(`photo-${answer.id}`)
      .filter((f): f is File => f instanceof File && f.size > 0);
    if (
      answer.value == null &&
      !answer.notApplicable &&
      !answer.reason &&
      !files.length
    )
      continue;
    const valueJson = (
      answer.notApplicable
        ? { state: "NERELEVANTNI", reason: answer.reason }
        : answer.value == null
          ? { uploaded: true }
          : { value: answer.value }
    ) as Prisma.InputJsonValue;
    const response = await prisma.inspectionResponse.upsert({
      where: {
        inspectionId_checklistItemId: {
          inspectionId: draftId,
          checklistItemId: answer.id!,
        },
      },
      update: { valueJson, note: answer.reason || null },
      create: {
        inspectionId: draftId,
        checklistItemId: answer.id!,
        valueJson,
        note: answer.reason || null,
      },
    });
    for (const file of files) {
      if (!file.type.startsWith("image/"))
        throw new Error("Příloha kontrolního bodu musí být fotografie.");
      const stored = await getStorage().put({
        body: new Uint8Array(await file.arrayBuffer()),
        fileName: file.name,
        mimeType: file.type,
        namespace: `inspections/${draftId}`,
      });
      await prisma.attachment.create({
        data: {
          ownerType: "InspectionResponse",
          ownerId: response.id,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: stored.sizeBytes,
          storageKey: stored.storageKey,
          checksumSha256: stored.checksumSha256,
          uploadedById: userId,
        },
      });
    }
  }
  await prisma.inspection.update({
    where: { id: draftId },
    data: {
      note: String(formData.get("note") ?? "") || null,
      limitationReason: String(formData.get("limitationReason") ?? "") || null,
      lockVersion: { increment: 1 },
    },
  });
  if (audit)
    await prisma.auditLog.create({
      data: {
        userId,
        action: "INSPECTION_DRAFT_SAVED",
        entityType: "Inspection",
        entityId: draftId,
        newValue: {
          answered: answers.filter((a) => a.value != null || a.notApplicable)
            .length,
        },
      },
    });
  return { draft, answers };
}

export async function saveInspectionDraft(formData: FormData) {
  const user = await requireInspectionOperator();
  try {
    await persistDraft(
      String(formData.get("draftId") ?? ""),
      user.id,
      formData,
    );
    revalidatePath("/kontroly");
    return { ok: true, message: "Rozpracovaná kontrola byla uložena." };
  } catch (error) {
    console.error("Uložení rozpracované kontroly selhalo", {
      userId: user.id,
      error,
    });
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Kontrolu se nepodařilo uložit.",
    };
  }
}

export async function closeInspection(formData: FormData) {
  const user = await requireInspectionOperator();
  const draftId = String(formData.get("draftId") ?? "");
  try {
    if (formData.get("confirmed") !== "on")
      throw new Error("Před uzavřením potvrďte správnost provedené kontroly.");
    await persistDraft(draftId, user.id, formData, false);
    const draft = await draftContext(draftId, user.id);
    if (!draft.identityVerifiedAt)
      throw new Error(
        "Před uzavřením je nutné ověřit identifikaci prostředku.",
      );
    assertAuthorized(user, draft.requirement!);
    const roles = user.roles.map((entry) => entry.role.code);
    const elevatedDates = canUseHistoricalDates(roles);
    const today = todayDateKey();
    const performedAt = parseDateOnly(
      formData.get("performedAt") || today,
      "Datum provedení kontroly",
    );
    if (dateKey(performedAt) > today)
      throw new Error("Kontrolu s budoucím datem nelze uzavřít. Ponechte ji naplánovanou.");
    if (!elevatedDates && dateKey(performedAt) !== today)
      throw new Error("Technik může bez zvláštního oprávnění uzavřít kontrolu pouze s dnešním datem.");
    const protocolDate = elevatedDates
      ? parseDateOnly(formData.get("protocolDate") || today, "Datum protokolu")
      : parseDateOnly(today, "Datum protokolu");
    if (dateKey(protocolDate) > today)
      throw new Error("Datum protokolu nesmí být v budoucnosti.");
    const protocolDateExceptionReason = String(
      formData.get("protocolDateExceptionReason") ?? "",
    ).trim();
    if (protocolDate < performedAt && !elevatedDates)
      throw new Error("Datum protokolu nesmí předcházet datu provedení kontroly.");
    if (protocolDate < performedAt && !protocolDateExceptionReason)
      throw new Error("U dřívějšího data protokolu je povinný důvod výjimky.");
    const responseAttachments = await prisma.attachment.findMany({
      where: {
        ownerType: "InspectionResponse",
        ownerId: { in: draft.responses.map((r) => r.id) },
        archivedAt: null,
      },
    });
    const photoCounts = new Map<string, number>();
    for (const response of draft.responses)
      photoCounts.set(
        response.checklistItemId,
        responseAttachments.filter((a) => a.ownerId === response.id).length,
      );
    const items = draft.checklistVersion.sections.flatMap((s) => s.items);
    const answers = items.map((item) => ({
      ...answerData(formData, item),
      photoCount: photoCounts.get(item.id) ?? 0,
    }));
    draft.checklistVersion.sections.forEach((section, index) => {
      const condition = section.items[0]?.conditionJson as {
        stopWhenPreviousSectionFailed?: boolean;
        showWhenAnyFailed?: boolean;
      } | null;
      const priorIds = draft.checklistVersion.sections
        .slice(0, index)
        .flatMap((s) => s.items.map((item) => item.id));
      const priorFailed = answers.some(
        (answer) => priorIds.includes(answer.id!) && isFailedAnswer(answer),
      );
      const hidden =
        (condition?.stopWhenPreviousSectionFailed && priorFailed) ||
        (condition?.showWhenAnyFailed &&
          !answers.some(
            (answer) =>
              isFailedAnswer(answer) &&
              !section.items.some((item) => item.id === answer.id),
          ));
      if (hidden)
        for (const answer of answers.filter((a) =>
          section.items.some((item) => item.id === a.id),
        )) {
          answer.required = false;
          answer.notApplicable = true;
          answer.allowNotApplicable = true;
        }
    });
    const validation = validateChecklistCompletion(answers);
    if (!validation.valid)
      throw new Error(
        "Doplňte všechny povinné body, požadované důvody a fotografie.",
      );
    const result = calculateInspectionResult(answers, draft.checklistVersion);
    const limitationReason = String(
      formData.get("limitationReason") ?? "",
    ).trim();
    if (result === "PASSED_WITH_LIMITATION" && !limitationReason)
      throw new Error(
        "U výsledku Vyhovuje s omezením je důvod omezení povinný.",
      );
    const now = new Date();
    let nextDueAt: Date | null = null,
      nextOperatingHours: number | null = null,
      nextUsageCount: number | null = null;
    if (
      result !== "FAILED" &&
      draft.requirement!.intervalValue &&
      draft.requirement!.trigger === "PERIODIC"
    ) {
      const unit = draft.requirement!.intervalUnit;
      if (unit && ["DAYS", "WEEKS", "MONTHS", "YEARS"].includes(unit))
        nextDueAt = nextDueFromPerformedAt({
          performedAt,
          intervalValue: draft.requirement!.intervalValue,
          intervalUnit: unit,
          result,
          trigger: draft.requirement!.trigger,
        });
      else if (unit === "OPERATING_HOURS")
        nextOperatingHours = nextOperatingThreshold(
          Number(draft.requirement!.equipment.currentOperatingHours ?? 0),
          draft.requirement!.intervalValue,
        );
      else if (unit === "USAGE_COUNT")
        nextUsageCount =
          draft.requirement!.equipment.usageCount +
          draft.requirement!.intervalValue;
    }
    const protocolId = randomUUID();
    const closed = await prisma.$transaction(async (tx) => {
      const claimed = await tx.inspection.updateMany({
        where: { id: draftId, state: "DRAFT" },
        data: {
          state: "CLOSED",
          result,
          completedAt: now,
          confirmedAt: now,
          performedAt,
          limitationReason: limitationReason || null,
          lockVersion: { increment: 1 },
        },
      });
      if (!claimed.count)
        return tx.protocol.findUnique({ where: { inspectionId: draftId } });
      const key = protocolCounterKey(protocolDate);
      const counter = await tx.protocolCounter.upsert({
        where: { key },
        create: { key, currentValue: 1 },
        update: { currentValue: { increment: 1 } },
      });
      const number = `${key}-${String(counter.currentValue).padStart(6, "0")}`;
      const equipment = draft.requirement!.equipment;
      const snapshot = {
        equipment: {
          id: equipment.id,
          uid: equipment.uid,
          name: equipment.name,
          manufacturer: equipment.manufacturer,
          model: equipment.model,
          serialNumber: equipment.serialNumber,
          registrationNumber: equipment.registrationNumber,
          legacyId: equipment.legacyId,
          vehicle: equipment.vehicle?.name ?? null,
          location: equipment.location?.name ?? null,
        },
        requirement: {
          id: draft.requirement!.id,
          name: draft.requirement!.name,
          type: draft.requirement!.type,
          intervalValue: draft.requirement!.intervalValue,
          intervalUnit: draft.requirement!.intervalUnit,
          source: draft.requirement!.source,
          article: draft.requirement!.ruleVersion?.article,
          ruleVersion: draft.requirement!.ruleVersion?.version,
          sourceDocument:
            draft.requirement!.ruleVersion?.rule.sourceDocument?.title ??
            draft.requirement!.sourceRule?.sourceDocument?.title,
        },
        checklist: {
          id: draft.checklistVersion.id,
          name: draft.checklistVersion.template.name,
          version: draft.checklistVersion.version,
          sections: draft.checklistVersion.sections.map((s) => ({
            title: s.title,
            items: s.items.map((item) => {
              const answer = answers.find((a) => a.id === item.id)!;
              const response = draft.responses.find(
                (r) => r.checklistItemId === item.id,
              );
              return {
                id: item.id,
                label: item.label,
                responseType: item.responseType,
                unit: item.unit,
                critical: item.critical,
                value: answer.notApplicable ? "NERELEVANTNÍ" : answer.value,
                note: answer.reason || null,
                photos: responseAttachments
                  .filter((a) => a.ownerId === response?.id)
                  .map((a) => ({
                    fileName: a.fileName,
                    mimeType: a.mimeType,
                    sizeBytes: String(a.sizeBytes),
                    storageKey: a.storageKey,
                    checksum: a.checksumSha256,
                  })),
              };
            }),
          })),
        },
        inspection: {
          id: draft.id,
          inspectorId: user.id,
          inspector: user.displayName,
          startedAt: draft.startedAt.toISOString(),
          completedAt: now.toISOString(),
          performedAt: performedAt.toISOString(),
          protocolDate: protocolDate.toISOString(),
          insertedAt: now.toISOString(),
          insertedBy: user.displayName,
          result,
          limitationReason: limitationReason || null,
          note: String(formData.get("note") ?? "") || null,
          nextDueAt: nextDueAt?.toISOString() ?? null,
          previousDueAt: draft.requirement!.nextDueAt?.toISOString() ?? null,
        },
        defects: answers
          .filter(
            (answer) =>
              isFailedAnswer(answer) &&
              (answer.failCreatesDefect ||
                answer.critical ||
                formData.get(`createDefect-${answer.id}`) === "on"),
          )
          .map((answer) => ({
            checklistItemId: answer.id,
            label: answer.label,
            description:
              answer.reason || `Nevyhovující kontrolní bod: ${answer.label}`,
            severity: answer.critical
              ? "CRITICAL"
              : String(formData.get(`severity-${answer.id}`) ?? "SIGNIFICANT"),
          })),
      };
      await tx.inspection.update({
        where: { id: draft.id },
        data: { snapshot: snapshot as Prisma.InputJsonValue },
      });
      const protocol = await tx.protocol.create({
        data: {
          id: protocolId,
          number,
          inspectionId: draft.id,
          equipmentId: equipment.id,
          protocolDate,
          snapshot: snapshot as Prisma.InputJsonValue,
          rules: draft.requirement!.ruleVersionId
            ? {
                create: {
                  ruleVersionId: draft.requirement!.ruleVersionId,
                  snapshot: {
                    name: draft.requirement!.name,
                    source: draft.requirement!.source,
                    intervalValue: draft.requirement!.intervalValue,
                    intervalUnit: draft.requirement!.intervalUnit,
                  },
                },
              }
            : undefined,
        },
      });
      const blocked = result === "FAILED";
      await tx.equipmentRequirementHistory.create({
        data: {
          requirementId: draft.requirement!.id,
          lastCompletedAt: performedAt,
          nextDueAt,
          intervalValue: draft.requirement!.intervalValue,
          intervalUnit: draft.requirement!.intervalUnit,
          status: blocked ? "OVERDUE_BLOCKED" : "COMPLIANT",
          source: draft.requirement!.source,
          note: `Uzavřen protokol ${number}`,
          recordedById: user.id,
        },
      });
      await tx.equipmentRequirement.update({
        where: { id: draft.requirement!.id },
        data: {
          lastCompletedAt: performedAt,
          nextDueAt,
          nextOperatingHours,
          nextUsageCount,
          status: blocked ? "OVERDUE_BLOCKED" : "COMPLIANT",
        },
      });
      const failed = answers.filter(isFailedAnswer);
      for (const answer of failed.filter(
        (a) =>
          a.failCreatesDefect ||
          a.critical ||
          formData.get(`createDefect-${a.id}`) === "on",
      ))
        await tx.defect.create({
          data: {
            equipmentId: equipment.id,
            inspectionId: draft.id,
            checklistItemId: answer.id,
            reportedById: user.id,
            description:
              answer.reason || `Nevyhovující kontrolní bod: ${answer.label}`,
            severity: answer.critical
              ? "CRITICAL"
              : ((["MINOR", "SIGNIFICANT", "CRITICAL"].includes(
                  String(formData.get(`severity-${answer.id}`)),
                )
                  ? String(formData.get(`severity-${answer.id}`))
                  : "SIGNIFICANT") as "MINOR" | "SIGNIFICANT" | "CRITICAL"),
          },
        });
      if (blocked) {
        if (!failed.some((a) => a.failCreatesDefect || a.critical))
          await tx.defect.create({
            data: {
              equipmentId: equipment.id,
              inspectionId: draft.id,
              reportedById: user.id,
              description: `Nevyhovující výsledek: ${draft.requirement!.name}`,
              severity: "CRITICAL",
            },
          });
        await tx.equipmentItem.update({
          where: { id: equipment.id },
          data: {
            status: "OUT_OF_SERVICE",
            complianceStatus: "OVERDUE_BLOCKED",
          },
        });
      } else {
        await tx.equipmentItem.update({
          where: { id: equipment.id },
          data: { complianceStatus: "COMPLIANT" },
        });
      }
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "INSPECTION_CLOSED",
          entityType: "Inspection",
          entityId: draft.id,
          newValue: {
            equipmentId: equipment.id,
            requirementId: draft.requirement!.id,
            protocolId: protocol.id,
            result,
            timestamp: now.toISOString(),
            performedAt: performedAt.toISOString(),
            protocolDate: protocolDate.toISOString(),
          },
        },
      });
      if (draft.scheduledFor && dateKey(draft.scheduledFor) !== dateKey(performedAt))
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "INSPECTION_PERFORMED_DATE_CHANGED",
            entityType: "Inspection",
            entityId: draft.id,
            previousValue: { performedAt: draft.scheduledFor.toISOString() },
            newValue: { performedAt: performedAt.toISOString() },
          },
        });
      if (dateKey(protocolDate) !== today || protocolDate < performedAt)
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "PROTOCOL_DATE_CHANGED",
            entityType: "Protocol",
            entityId: protocol.id,
            previousValue: { protocolDate: today },
            newValue: { protocolDate: dateKey(protocolDate) },
            reason: protocolDateExceptionReason || null,
          },
        });
      if (draft.correctionOfId) {
        await tx.inspection.update({
          where: { id: draft.correctionOfId },
          data: { state: "CORRECTED" },
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "INSPECTION_CORRECTED",
            entityType: "Inspection",
            entityId: draft.id,
            newValue: {
              correctionOfId: draft.correctionOfId,
              protocolId: protocol.id,
            },
          },
        });
      }
      return protocol;
    });
    if (!closed) throw new Error("Kontrola již byla uzavřena.");
    revalidatePath("/kontroly");
    revalidatePath("/protokoly");
    revalidatePath(`/prostredky/${draft.equipmentId}`);
    redirect(`/kontroly/${draft.id}/dokonceno`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error("Uzavření kontroly selhalo", {
      userId: user.id,
      draftId,
      error,
    });
    const draft = await prisma.inspection.findUnique({
      where: { id: draftId },
      select: { requirementId: true },
    });
    redirect(
      `/kontroly/provest/${draft?.requirementId ?? ""}?draft=${draftId}&chyba=${encodeURIComponent(error instanceof Error ? error.message : "Kontrolu se nepodařilo uzavřít.")}`,
    );
  }
}

export async function cancelInspection(formData: FormData) {
  const user = await requireInspectionOperator();
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) throw new Error("Důvod storna je povinný.");
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
  });
  if (!inspection) return;
  const roles = new Set(user.roles.map((r) => r.role.code));
  if (!roles.has("ADMIN") && !roles.has("TS_ADMIN"))
    throw new Error("Stornovat uzavřenou kontrolu může pouze správce.");
  if (inspection.state !== "CLOSED")
    throw new Error("Stornovat lze pouze uzavřenou kontrolu.");
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.inspection.update({
      where: { id: inspectionId },
      data: {
        state: "CANCELLED",
        cancellationReason: reason,
        cancelledAt: now,
        cancelledById: user.id,
      },
    });
    await tx.protocol.updateMany({
      where: { inspectionId },
      data: { cancelledAt: now, cancelledById: user.id, cancellationReason: reason },
    });
    if (inspection.requirementId) {
      const valid = await tx.inspection.findMany({
        where: { requirementId: inspection.requirementId, state: "CLOSED", id: { not: inspectionId } },
        select: { performedAt: true, completedAt: true, result: true, snapshot: true },
      });
      const restored = restoreRequirementFromValidInspections(valid.map((entry) => ({
        performedAt: entry.performedAt,
        completedAt: entry.completedAt,
        result: entry.result,
        nextDueAt: ((entry.snapshot as { inspection?: { nextDueAt?: string | null } } | null)?.inspection?.nextDueAt ?? null),
      })));
      const restoredLast = restored.lastCompletedAt;
      const restoredNext = restored.nextDueAt;
      const restoredStatus = restored.status;
      await tx.equipmentRequirement.update({
        where: { id: inspection.requirementId },
        data: { lastCompletedAt: restoredLast, nextDueAt: restoredNext, status: restoredStatus },
      });
      await tx.equipmentRequirementHistory.create({
        data: {
          requirementId: inspection.requirementId,
          lastCompletedAt: restoredLast,
          nextDueAt: restoredNext,
          status: restoredStatus,
          note: `Přepočet po stornu kontroly ${inspectionId}`,
          recordedById: user.id,
        },
      });
      const activeRequirements = await tx.equipmentRequirement.findMany({
        where: { equipmentId: inspection.equipmentId, archivedAt: null },
        select: { status: true, lastCompletedAt: true, nextDueAt: true },
      });
      const equipmentCompliance = activeRequirements.some((entry) => entry.status === "OVERDUE_BLOCKED")
        ? "OVERDUE_BLOCKED"
        : activeRequirements.some((entry) => entry.status === "DUE_SOON")
          ? "DUE_SOON"
          : activeRequirements.some((entry) => entry.lastCompletedAt || entry.nextDueAt)
            ? "COMPLIANT"
            : "UNDEFINED";
      await tx.equipmentItem.update({ where: { id: inspection.equipmentId }, data: { complianceStatus: equipmentCompliance } });
    }
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "INSPECTION_CANCELLED",
        entityType: "Inspection",
        entityId: inspectionId,
        reason,
        previousValue: { state: inspection.state },
        newValue: { state: "CANCELLED", cancelledAt: now.toISOString() },
      },
    });
  });
  revalidatePath("/kontroly");
  revalidatePath(`/kontroly/${inspectionId}`);
}

export async function deleteInspectionDraft(formData: FormData) {
  const user = await requireInspectionOperator();
  const roles = new Set(user.roles.map((entry) => entry.role.code));
  if (!roles.has("ADMIN") && !roles.has("TS_ADMIN"))
    throw new Error("Odstranit rozpracovanou kontrolu může pouze správce.");
  const inspectionId = String(formData.get("inspectionId") ?? "");
  await prisma.$transaction(async (tx) => {
    const draft = await tx.inspection.findUnique({
      where: { id: inspectionId },
      include: { responses: { select: { id: true } }, protocol: true },
    });
    if (!draft || draft.state !== "DRAFT" || draft.protocol)
      throw new Error("Fyzicky odstranit lze pouze draft bez protokolu.");
    const responseIds = draft.responses.map((response) => response.id);
    if (responseIds.length)
      await tx.attachment.deleteMany({ where: { ownerType: "InspectionResponse", ownerId: { in: responseIds } } });
    await tx.inspectionResponse.deleteMany({ where: { inspectionId } });
    await tx.inspection.delete({ where: { id: inspectionId } });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "INSPECTION_DRAFT_DELETED",
        entityType: "Inspection",
        entityId: inspectionId,
        previousValue: { equipmentId: draft.equipmentId, requirementId: draft.requirementId, scheduledFor: draft.scheduledFor?.toISOString() },
      },
    });
  });
  revalidatePath("/kontroly");
}

export async function scheduleInspection(formData: FormData) {
  const user = await requireInspectionOperator();
  const requirementId = String(formData.get("requirementId") ?? "");
  const requirement = await loadRequirement(requirementId);
  assertAuthorized(user, requirement);
  const scheduledFor = parseDateOnly(formData.get("scheduledFor"), "Plánované datum kontroly");
  const note = String(formData.get("note") ?? "").trim();
  const resolved = await resolveInspectionChecklist(requirement.ruleVersion?.checklistTemplateVersionId);
  const draft = await prisma.$transaction(async (tx) => {
    const created = await tx.inspection.create({
      data: {
        equipmentId: requirement.equipmentId,
        requirementId,
        inspectorId: user.id,
        checklistVersionId: resolved.checklistVersionId,
        inspectionType: requirement.name,
        level: levelFor(requirement.performedBy),
        scheduledFor,
        note: note || null,
      },
    });
    await tx.auditLog.create({ data: { userId: user.id, action: "INSPECTION_SCHEDULED", entityType: "Inspection", entityId: created.id, newValue: { scheduledFor: scheduledFor.toISOString(), note: note || null } } });
    return created;
  });
  revalidatePath("/kontroly");
  revalidatePath("/kalendar");
  redirect(`/kontroly?tab=rozpracovane&naplanovano=${draft.id}`);
}

export async function saveShiftInspection(formData: FormData) {
  const user = await requireInspectionOperator();
  const vehicleId = String(formData.get("vehicleId") ?? "");
  const equipment = await prisma.equipmentItem.findMany({
    where: { vehicleId, archivedAt: null },
    select: { id: true },
  });
  const labels: Record<string, string> = {
    OK: "V pořádku",
    DEFECT: "Závada",
    MISSING: "Chybí",
    USED: "Použito předchozí směnou",
  };
  const now = new Date();
  const entries = equipment.flatMap((item) => {
    const state = String(formData.get(`state-${item.id}`) ?? "");
    if (!labels[state]) return [];
    return prisma.equipmentLogEntry.create({
      data: {
        equipmentId: item.id,
        eventType:
          state === "DEFECT" || state === "MISSING" ? "DEFECT" : "INSPECTION",
        occurredAt: now,
        description: `Směnová kontrola: ${labels[state]}`,
        createdById: user.id,
        source: "Směnová kontrola",
      },
    });
  });
  await prisma.$transaction([
    ...entries,
    prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "SHIFT_INSPECTION_SAVED",
        entityType: "Vehicle",
        entityId: vehicleId,
        newValue: { recorded: entries.length, timestamp: now.toISOString() },
      },
    }),
  ]);
  revalidatePath("/kontroly");
  redirect("/kontroly?tab=smenove&hotovo=1");
}

export async function startCorrection(formData: FormData) {
  const user = await requireInspectionOperator();
  const originalId = String(formData.get("inspectionId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason)
    redirect(
      `/kontroly/${originalId}?chyba=${encodeURIComponent("Důvod opravné kontroly je povinný.")}`,
    );
  const original = await prisma.inspection.findUnique({
    where: { id: originalId },
    include: { requirement: { include: detailInclude } },
  });
  if (
    !original?.requirementId ||
    !original.requirement ||
    !["CLOSED", "CORRECTED"].includes(original.state)
  )
    redirect(`/kontroly/${originalId}`);
  assertAuthorized(user, original.requirement);
  const existing = await prisma.inspection.findFirst({
    where: {
      inspectorId: user.id,
      equipmentId: original.equipmentId,
      requirementId: original.requirementId,
      state: "DRAFT",
    },
  });
  if (existing)
    redirect(
      `/kontroly/provest/${original.requirementId}?draft=${existing.id}`,
    );
  const draft = await prisma.$transaction(async (tx) => {
    const created = await tx.inspection.create({
      data: {
        equipmentId: original.equipmentId,
        requirementId: original.requirementId!,
        inspectorId: user.id,
        checklistVersionId: original.checklistVersionId,
        inspectionType: original.inspectionType,
        level: original.level,
        correctionOfId: original.id,
        correctionReason: reason,
        identityVerifiedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "INSPECTION_STARTED",
        entityType: "Inspection",
        entityId: created.id,
        reason,
        newValue: { correctionOfId: original.id },
      },
    });
    return created;
  });
  redirect(`/kontroly/provest/${original.requirementId}?draft=${draft.id}`);
}
