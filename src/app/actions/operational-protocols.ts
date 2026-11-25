"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSystemAdministrator } from "@/lib/authorization";
import { requireOperationalPermission } from "@/lib/operational-authorization";
import {
  operationalCounterKey,
  protocolTypes,
  type OperationalType,
  assertFinancialApproval,
  assertRepairTransition,
} from "@/lib/operational-workflow";
import {
  parseDateOnly,
  todayDateKey,
  dateKey,
} from "@/lib/inspection-lifecycle";
import { prisma } from "@/lib/prisma";
import { operationalLabels, handoverPurposes } from "@/lib/operational-fields";
import { operationalSnapshot } from "@/lib/operational-snapshot";
import { renderOperationalPdf } from "@/lib/operational-pdf";
import { pdfFonts } from "@/lib/pdf-fonts";
import { money } from "@/lib/operational-money";

const value = (form: FormData, key: string) =>
  String(form.get(key) ?? "").trim();
const transactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
};

export async function grantOperationalPermission(form: FormData) {
  const actor = await requireSystemAdministrator();
  const userId = value(form, "userId");
  if (
    !(await prisma.user.findFirst({
      where: { id: userId, organizationId: actor.organizationId },
    }))
  )
    throw new Error("Uživatel neexistuje.");
  const code = value(form, "permission");
  const allowed = [
    "protocol:read",
    "protocol:create",
    "protocol:edit_draft",
    "protocol:issue",
    "protocol:cancel",
    "protocol:download",
    "handover:confirm",
    "handover:return",
    "equipment:out_of_service",
    "equipment:return_to_service",
    "repair:create",
    "repair:approve",
    "repair:manage",
    "repair:costs_read",
    "repair:costs_edit",
    "supplier:manage",
  ];
  if (!allowed.includes(code)) throw new Error("Neznámé oprávnění.");
  await prisma.$transaction(async (tx) => {
    const permission = await tx.permission.upsert({
      where: { code },
      create: { code, name: code },
      update: {},
    });
    if (form.get("revoke") === "on")
      await tx.userPermission.deleteMany({
        where: { userId, permissionId: permission.id },
      });
    else
      await tx.userPermission.upsert({
        where: { userId_permissionId: { userId, permissionId: permission.id } },
        create: { userId, permissionId: permission.id },
        update: {},
      });
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: "USER_PERMISSION_CHANGED",
        entityType: "User",
        entityId: userId,
        newValue: { permission: code, granted: form.get("revoke") !== "on" },
      },
    });
  });
  revalidatePath("/administrace/opravneni");
}

export async function saveOperationalDraft(form: FormData) {
  const user = await requireOperationalPermission("protocol:create");
  const type = value(form, "type") as OperationalType;
  if (!(type in protocolTypes)) throw new Error("Vyberte druh dokumentu.");
  const equipmentIds = [
    ...new Set(form.getAll("equipmentId").map(String).filter(Boolean)),
  ];
  if (
    !equipmentIds.length ||
    (type !== "HANDOVER" && equipmentIds.length !== 1)
  )
    throw new Error("Vyberte odpovídající počet prostředků.");
  const equipment = await prisma.equipmentItem.findMany({
    where: {
      id: { in: equipmentIds },
      organizationId: user.organizationId,
      archivedAt: null,
    },
  });
  if (equipment.length !== equipmentIds.length)
    throw new Error("Některý prostředek není dostupný.");
  const data = Object.fromEntries(
    Object.keys(operationalLabels).map((key) => [key, value(form, key)]),
  );
  if (value(form, "recipientUserId")) {
    const recipient = await prisma.user.findFirst({
      where: {
        id: value(form, "recipientUserId"),
        organizationId: user.organizationId,
        active: true,
      },
      select: { id: true, displayName: true },
    });
    if (!recipient) throw new Error("Vybraný příjemce není dostupný.");
    data.recipientUserId = recipient.id;
    data.recipient = recipient.displayName;
  }
  if (!data.reason) throw new Error("Důvod je povinný.");
  const protocolDate = parseDateOnly(
    form.get("protocolDate"),
    "Datum protokolu",
  );
  const occurred = value(form, "eventOccurredAt");
  const id = value(form, "id");
  const document = await prisma.$transaction(async (tx) => {
    if (
      data.supplierId &&
      !(await tx.serviceSupplier.findFirst({
        where: {
          id: data.supplierId,
          organizationId: user.organizationId,
          archivedAt: null,
        },
      }))
    )
      throw new Error("Dodavatel není dostupný.");
    if (
      data.relatedInspectionId &&
      !(await tx.inspection.findFirst({
        where: {
          id: data.relatedInspectionId,
          equipmentId: { in: equipmentIds },
          equipment: { organizationId: user.organizationId },
        },
      }))
    )
      throw new Error("Související kontrola nepatří k prostředku.");
    if (
      data.relatedDefectId &&
      !(await tx.defect.findFirst({
        where: {
          id: data.relatedDefectId,
          equipmentId: { in: equipmentIds },
          equipment: { organizationId: user.organizationId },
        },
      }))
    )
      throw new Error("Související závada nepatří k prostředku.");
    if (
      data.relatedProtocolId &&
      !(await tx.operationalProtocol.findFirst({
        where: {
          id: data.relatedProtocolId,
          organizationId: user.organizationId,
        },
      }))
    )
      throw new Error("Související protokol není dostupný.");
    if (
      data.repairCaseId &&
      !(await tx.repairCase.findFirst({
        where: {
          id: data.repairCaseId,
          organizationId: user.organizationId,
          equipmentId: { in: equipmentIds },
        },
      }))
    )
      throw new Error("Servisní případ nepatří k vybraným prostředkům.");
    const itemData = equipment.map((e) => {
      const quantity = Number(value(form, `quantity-${e.id}`) || "1");
      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        (e.evidenceMode === "INDIVIDUAL" && quantity !== 1) ||
        quantity > e.quantity
      )
        throw new Error("Neplatný počet kusů prostředku.");
      return {
        equipmentId: e.id,
        quantity,
        details: {
          condition: value(form, `condition-${e.id}`) || data.condition,
          accessories: value(form, `accessories-${e.id}`) || data.accessories,
          description: value(form, `description-${e.id}`),
          note: value(form, `note-${e.id}`),
        },
      };
    });
    const links = {
      supplierId: data.supplierId || null,
      relatedInspectionId: data.relatedInspectionId || null,
      relatedProtocolId: data.relatedProtocolId || null,
      eventPlannedAt: value(form, "eventPlannedAt")
        ? parseDateOnly(form.get("eventPlannedAt"), "Plánované datum")
        : null,
    };
    if (id) {
      await requireOperationalPermission("protocol:edit_draft");
      const current = await tx.operationalProtocol.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          status: "DRAFT",
          createdById: user.id,
        },
      });
      if (!current) throw new Error("Rozpracovaný dokument není dostupný.");
      if (current.type !== type)
        throw new Error("Druh existujícího dokumentu nelze změnit.");
      await tx.operationalProtocolItem.deleteMany({
        where: { protocolId: id },
      });
      const result = await tx.operationalProtocol.update({
        where: { id },
        data: {
          ...links,
          draftData: data,
          protocolDate,
          eventOccurredAt: occurred
            ? parseDateOnly(occurred, "Datum události")
            : null,
          items: { create: itemData },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "PROTOCOL_DRAFT_UPDATED",
          entityType: "OperationalProtocol",
          entityId: id,
          previousValue: current.draftData ?? Prisma.JsonNull,
          newValue: data,
        },
      });
      return result;
    }
    const result = await tx.operationalProtocol.create({
      data: {
        ...links,
        organizationId: user.organizationId,
        type,
        title: protocolTypes[type],
        protocolDate,
        createdById: user.id,
        eventOccurredAt: occurred
          ? parseDateOnly(occurred, "Datum události")
          : null,
        draftData: data,
        items: { create: itemData },
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "PROTOCOL_CREATED",
        entityType: "OperationalProtocol",
        entityId: result.id,
        newValue: { type, equipmentIds },
      },
    });
    return result;
  }, transactionOptions);
  redirect(`/protokoly/provozni/${document.id}`);
}

export async function issueOperationalProtocol(form: FormData) {
  const user = await requireOperationalPermission("protocol:issue");
  const id = value(form, "id");
  await prisma.$transaction(async (tx) => {
    const doc = await tx.operationalProtocol.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { items: true },
    });
    if (!doc) throw new Error("Dokument neexistuje.");
    if (doc.status === "ISSUED") return;
    if (doc.status !== "DRAFT") throw new Error("Dokument nelze vystavit.");
    const draftData = doc.draftData as Record<string, string>;
    if (
      doc.type === "REPAIR_PROPOSAL" &&
      (!draftData.description ||
        !draftData.solution ||
        !draftData.justification)
    )
      throw new Error(
        "Před vystavením doplňte popis závady, navrhovanou opravu a odůvodnění.",
      );
    if (
      doc.type === "HANDOVER" &&
      (!draftData.sender ||
        !draftData.recipient ||
        !draftData.place ||
        !Object.hasOwn(handoverPurposes, draftData.handoverPurpose))
    )
      throw new Error(
        "Před vystavením doplňte předávajícího, příjemce, místo a účel předání.",
      );
    if (dateKey(doc.protocolDate) > todayDateKey())
      throw new Error("Budoucí dokument ponechte rozpracovaný.");
    if (doc.eventOccurredAt && dateKey(doc.eventOccurredAt) > todayDateKey())
      throw new Error("Budoucí událost nelze potvrdit jako skutečnou.");
    const equipment = await tx.equipmentItem.findMany({
      where: {
        id: { in: doc.items.map((i) => i.equipmentId) },
        organizationId: user.organizationId,
      },
    });
    if (equipment.length !== doc.items.length)
      throw new Error("Nedostupné prostředky.");
    const key = operationalCounterKey(doc.type, doc.protocolDate);
    const counter = await tx.protocolCounter.upsert({
      where: { key },
      create: { key, currentValue: 1 },
      update: { currentValue: { increment: 1 } },
    });
    const number = `${key}-${String(counter.currentValue).padStart(6, "0")}`;
    const snapshot = {
      ...(await operationalSnapshot(tx, id, user.displayName)),
      number,
    };
    const pdfCheck = await renderOperationalPdf({
      snapshot,
      ...(await pdfFonts()),
    });
    snapshot.hasAppendix = pdfCheck.hasAppendix;
    await tx.operationalProtocol.update({
      where: { id },
      data: {
        number,
        status: "ISSUED",
        issuedAt: new Date(),
        issuedById: user.id,
        snapshot: snapshot as Prisma.InputJsonValue,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "PROTOCOL_ISSUED",
        entityType: "OperationalProtocol",
        entityId: id,
        newValue: { number },
      },
    });
  }, transactionOptions);
  revalidatePath("/protokoly");
  revalidatePath(`/protokoly/provozni/${id}`);
}

export async function cancelOperationalProtocol(form: FormData) {
  const user = await requireOperationalPermission("protocol:cancel");
  const id = value(form, "id"),
    reason = value(form, "reason");
  if (!reason) throw new Error("Důvod storna je povinný.");
  await prisma.$transaction(async (tx) => {
    const changed = await tx.operationalProtocol.updateMany({
      where: { id, organizationId: user.organizationId, status: "ISSUED" },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledById: user.id,
        cancellationReason: reason,
      },
    });
    if (changed.count) {
      const submissions = await tx.repairEvent.findMany({
        where: {
          newState: "PENDING_APPROVAL",
          data: { path: ["protocolId"], equals: id },
          repairCase: { organizationId: user.organizationId },
        },
      });
      for (const submission of submissions) {
        const latest = await tx.repairEvent.findFirst({
          where: { repairCaseId: submission.repairCaseId },
          orderBy: { createdAt: "desc" },
        });
        if (latest?.id === submission.id) {
          await tx.repairCase.updateMany({
            where: { id: submission.repairCaseId, state: "PENDING_APPROVAL" },
            data: { state: "PROPOSAL_REQUIRED" },
          });
          await tx.repairEvent.create({
            data: {
              repairCaseId: submission.repairCaseId,
              previousState: "PENDING_APPROVAL",
              newState: "PROPOSAL_REQUIRED",
              userId: user.id,
              note: `Stornován návrh: ${reason}`,
            },
          });
        }
      }
    }
    if (changed.count)
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "PROTOCOL_CANCELLED",
          entityType: "OperationalProtocol",
          entityId: id,
          reason,
        },
      });
  });
  revalidatePath("/protokoly");
  revalidatePath(`/protokoly/provozni/${id}`);
}

export async function deleteOperationalDraft(form: FormData) {
  const user = await requireOperationalPermission("protocol:edit_draft");
  const id = value(form, "id");
  await prisma.$transaction(async (tx) => {
    const changed = await tx.operationalProtocol.deleteMany({
      where: {
        id,
        organizationId: user.organizationId,
        status: "DRAFT",
        createdById: user.id,
      },
    });
    if (changed.count)
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "PROTOCOL_DRAFT_DELETED",
          entityType: "OperationalProtocol",
          entityId: id,
        },
      });
  });
  redirect("/protokoly");
}

export async function decideRepairProposal(form: FormData) {
  const actor = await requireOperationalPermission("repair:approve");
  const id = value(form, "id"),
    decision = value(form, "decision"),
    reason = value(form, "reason");
  if (!["APPROVED", "REJECTED", "CHANGES_REQUIRED"].includes(decision))
    throw new Error("Neplatné rozhodnutí.");
  await prisma.$transaction(async (tx) => {
    const doc = await tx.operationalProtocol.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        type: "REPAIR_PROPOSAL",
        status: "ISSUED",
      },
      include: { repairCase: true },
    });
    const submission = await tx.auditLog.findFirst({
      where: {
        action: "REPAIR_SUBMITTED",
        entityType: "OperationalProtocol",
        entityId: id,
      },
    });
    const repairId = (submission?.newValue as { repairCaseId?: string } | null)
      ?.repairCaseId;
    const repair = repairId
      ? await tx.repairCase.findFirst({
          where: { id: repairId, organizationId: actor.organizationId },
        })
      : null;
    const latestSubmission = repair
      ? await tx.repairEvent.findFirst({
          where: { repairCaseId: repair.id, newState: "PENDING_APPROVAL" },
          orderBy: { createdAt: "desc" },
        })
      : null;
    if (
      !doc ||
      !repair ||
      repair.state !== "PENDING_APPROVAL" ||
      (latestSubmission?.data as { protocolId?: string } | null)?.protocolId !==
        id
    )
      throw new Error(
        "Návrh nečeká na rozhodnutí nebo byl nahrazen novou verzí.",
      );
    assertFinancialApproval({
      authorId: doc.createdById,
      actorId: actor.id,
      allowed: true,
      reason,
    });
    const limit =
      decision === "APPROVED" ? money(value(form, "approvedLimit")) : null;
    if (limit?.isNegative()) throw new Error("Limit nesmí být záporný.");
    await tx.repairDecision.create({
      data: {
        protocolId: id,
        repairCaseId: repair.id,
        decision,
        decidedById: actor.id,
        reason,
        approvedLimit: limit,
        conditions: value(form, "conditions"),
      },
    });
    const resumeState = (
      latestSubmission?.data as { resumeState?: string } | null
    )?.resumeState;
    const approvedState =
      decision === "APPROVED" &&
      resumeState &&
      [
        "APPROVED",
        "ORDERED",
        "HANDED_OVER",
        "IN_REPAIR",
        "WAITING_PARTS",
        "REPAIR_COMPLETED",
        "AWAITING_COLLECTION",
        "AWAITING_INSPECTION",
      ].includes(resumeState)
        ? (resumeState as typeof repair.state)
        : (decision as "APPROVED" | "REJECTED" | "CHANGES_REQUIRED");
    await tx.repairCase.update({
      where: { id: repair.id },
      data: { state: approvedState, approvedLimit: limit },
    });
    await tx.repairEvent.create({
      data: {
        repairCaseId: repair.id,
        previousState: "PENDING_APPROVAL",
        newState: approvedState,
        userId: actor.id,
        note: reason,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: `REPAIR_${decision === "CHANGES_REQUIRED" ? "RETURNED_FOR_CHANGES" : decision}`,
        entityType: "OperationalProtocol",
        entityId: id,
        reason,
      },
    });
  }, transactionOptions);
  revalidatePath(`/protokoly/provozni/${id}`);
}

export async function advanceRepair(form: FormData) {
  const user = await requireOperationalPermission("repair:manage");
  const id = value(form, "repairCaseId"),
    next = value(form, "state");
  if (
    [
      "APPROVED",
      "REJECTED",
      "CHANGES_REQUIRED",
      "CLOSED",
      "PENDING_APPROVAL",
    ].includes(next)
  )
    throw new Error("Použijte příslušné schvalovací nebo návratové workflow.");
  await prisma.$transaction(async (tx) => {
    const current = await tx.repairCase.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!current) throw new Error("Oprava neexistuje.");
    assertRepairTransition(current.state, next);
    if (next === "ORDERED" && !current.approvedLimit)
      throw new Error("Oprava nemá schválený finanční limit.");
    if (
      next === "REPAIR_COMPLETED" &&
      current.actualCost &&
      current.approvedLimit &&
      current.actualCost.gt(current.approvedLimit)
    )
      throw new Error(
        "Skutečná cena překračuje limit. Nejprve vyžádejte dodatečné schválení.",
      );
    await tx.repairCase.update({
      where: { id },
      data: { state: next as typeof current.state },
    });
    if (["IN_REPAIR", "AWAITING_INSPECTION"].includes(next)) {
      const equipment = await tx.equipmentItem.findUniqueOrThrow({
        where: { id: current.equipmentId },
      });
      const status = next === "IN_REPAIR" ? "IN_REPAIR" : "AWAITING_INSPECTION";
      await tx.equipmentItem.update({
        where: { id: equipment.id },
        data: { status },
      });
      await tx.equipmentStatusHistory.create({
        data: {
          equipmentId: equipment.id,
          fromStatus: equipment.status,
          toStatus: status,
          changedById: user.id,
          reason: value(form, "note") || "Změna průběhu opravy",
        },
      });
    }
    await tx.repairEvent.create({
      data: {
        repairCaseId: id,
        previousState: current.state,
        newState: next as typeof current.state,
        userId: user.id,
        note: value(form, "note"),
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: `REPAIR_${next}`,
        entityType: "RepairCase",
        entityId: id,
        previousValue: { state: current.state },
        newValue: { state: next },
      },
    });
  }, transactionOptions);
  revalidatePath("/zavady");
}

export async function confirmOperationalEvent(form: FormData) {
  const reader = await requireOperationalPermission("protocol:read");
  const id = value(form, "id");
  const current = await prisma.operationalProtocol.findFirst({
    where: { id, organizationId: reader.organizationId },
  });
  if (!current) throw new Error("Dokument neexistuje.");
  const user = await requireOperationalPermission(
    current.type === "HANDOVER"
      ? "handover:confirm"
      : "equipment:out_of_service",
  );
  if (current.type === "REPAIR_PROPOSAL")
    throw new Error("Návrh opravy není skutečnou provozní událostí.");
  if (form.get("confirmed") !== "on")
    throw new Error("Potvrďte skutečné provedení události.");
  const eventDate = parseDateOnly(form.get("eventDate"), "Datum události");
  if (dateKey(eventDate) > todayDateKey())
    throw new Error("Budoucí událost nelze potvrdit.");
  await prisma.$transaction(async (tx) => {
    const doc = await tx.operationalProtocol.findFirst({
      where: { id, organizationId: user.organizationId, status: "ISSUED" },
      include: { items: true },
    });
    if (!doc) throw new Error("Potvrdit lze pouze vystavený dokument.");
    const already = await tx.auditLog.findFirst({
      where: {
        entityType: "OperationalProtocol",
        entityId: id,
        action:
          doc.type === "HANDOVER"
            ? "HANDOVER_CONFIRMED"
            : "EQUIPMENT_OUT_OF_SERVICE",
      },
    });
    if (already) return;
    if (
      doc.eventOccurredAt &&
      dateKey(doc.eventOccurredAt) !== dateKey(eventDate)
    )
      throw new Error(
        "Datum skutečné události se liší od vystaveného dokumentu. Vytvořte opravený návrh.",
      );
    const data = doc.draftData as Record<string, string>;
    for (const item of doc.items) {
      const equipment = await tx.equipmentItem.findFirst({
        where: { id: item.equipmentId, organizationId: user.organizationId },
      });
      if (!equipment) throw new Error("Prostředek není dostupný.");
      if (doc.type === "HANDOVER") {
        if (
          await tx.handoverMovement.findFirst({
            where: { equipmentId: item.equipmentId, returnedAt: null },
          })
        )
          throw new Error("Prostředek je již v aktivním předání.");
        if (!Object.hasOwn(handoverPurposes, data.handoverPurpose))
          throw new Error("Vyberte účel předání.");
        const expectedReturnAt = data.expectedReturn
          ? parseDateOnly(data.expectedReturn, "Vrácení do")
          : null;
        if (expectedReturnAt && expectedReturnAt < eventDate)
          throw new Error("Vrácení nesmí předcházet předání.");
        const finalTransfer = [
          "PERMANENT",
          "VEHICLE",
          "STATION",
          "RETURN",
        ].includes(data.handoverPurpose);
        await tx.handoverMovement.create({
          data: {
            itemId: item.id,
            equipmentId: item.equipmentId,
            handedOverAt: eventDate,
            handedOverById: user.id,
            expectedReturnAt,
            ...(finalTransfer
              ? {
                  returnedAt: eventDate,
                  returnedById: user.id,
                  returnData: { finalTransfer: true },
                }
              : {}),
          },
        });
        const location = data.targetLocationId
          ? await tx.location.findFirst({
              where: {
                id: data.targetLocationId,
                station: { organizationId: user.organizationId },
              },
            })
          : null;
        const vehicle = data.targetVehicleId
          ? await tx.vehicle.findFirst({
              where: {
                id: data.targetVehicleId,
                station: { organizationId: user.organizationId },
              },
            })
          : null;
        if (
          (data.targetLocationId && !location) ||
          (data.targetVehicleId && !vehicle)
        )
          throw new Error("Cílové umístění nebo vozidlo není dostupné.");
        if (
          (data.handoverPurpose === "VEHICLE" && !vehicle) ||
          (data.handoverPurpose === "STATION" && !location)
        )
          throw new Error("Vyberte cílové vozidlo nebo umístění.");
        let locationId = location?.id;
        if (
          ["SERVICE", "REPAIR"].includes(data.handoverPurpose) &&
          !locationId
        ) {
          const seedKey = `external-service:${equipment.stationId}:${data.recipientOrganization || data.recipient}`;
          const external = await tx.location.upsert({
            where: { seedKey },
            update: {},
            create: {
              seedKey,
              stationId: equipment.stationId,
              name: `Externí servis – ${data.recipientOrganization || data.recipient}`,
            },
          });
          locationId = external.id;
        }
        const status = ["SERVICE", "REPAIR"].includes(data.handoverPurpose)
          ? "IN_REPAIR"
          : ["LOAN", "PERSON"].includes(data.handoverPurpose)
            ? "LOANED"
            : equipment.status;
        await tx.equipmentItem.update({
          where: { id: equipment.id },
          data: {
            status,
            ...(locationId ? { locationId, vehicleId: null } : {}),
            ...(vehicle ? { vehicleId: vehicle.id, locationId: null } : {}),
          },
        });
        await tx.equipmentStatusHistory.create({
          data: {
            equipmentId: equipment.id,
            fromStatus: equipment.status,
            toStatus: status,
            reason: `Potvrzené předání ${doc.number}`,
            changedById: user.id,
          },
        });
      } else {
        await tx.equipmentItem.update({
          where: { id: equipment.id },
          data: {
            status: "OUT_OF_SERVICE",
            complianceStatus: "OVERDUE_BLOCKED",
          },
        });
        const existing = await tx.defect.findFirst({
          where: {
            equipmentId: equipment.id,
            closedAt: null,
            ...(doc.relatedInspectionId
              ? { inspectionId: doc.relatedInspectionId }
              : {}),
          },
        });
        if (!existing)
          await tx.defect.create({
            data: {
              equipmentId: equipment.id,
              inspectionId: doc.relatedInspectionId,
              reportedById: user.id,
              description: data.description || data.reason,
              severity:
                data.severity === "CRITICAL"
                  ? "CRITICAL"
                  : data.severity === "MINOR"
                    ? "MINOR"
                    : "SIGNIFICANT",
            },
          });
        await tx.equipmentStatusHistory.create({
          data: {
            equipmentId: equipment.id,
            fromStatus: equipment.status,
            toStatus: "OUT_OF_SERVICE",
            reason: data.reason,
            changedById: user.id,
          },
        });
      }
      await tx.equipmentLogEntry.create({
        data: {
          equipmentId: equipment.id,
          eventType: "OTHER",
          occurredAt: eventDate,
          description: `${doc.title} ${doc.number}: ${data.reason}`,
          createdById: user.id,
        },
      });
      if (
        doc.type === "HANDOVER" &&
        data.repairCaseId &&
        ["SERVICE", "REPAIR"].includes(data.handoverPurpose)
      ) {
        const repair = await tx.repairCase.findFirst({
          where: {
            id: data.repairCaseId,
            equipmentId: equipment.id,
            organizationId: user.organizationId,
          },
        });
        if (
          !repair ||
          !["ORDERED", "HANDED_OVER", "IN_REPAIR"].includes(repair.state)
        )
          throw new Error(
            "Předání do opravy vyžaduje schválenou a objednanou opravu.",
          );
        if (repair.state === "ORDERED") {
          await tx.repairCase.update({
            where: { id: repair.id },
            data: { state: "HANDED_OVER" },
          });
          await tx.repairEvent.create({
            data: {
              repairCaseId: repair.id,
              previousState: "ORDERED",
              newState: "HANDED_OVER",
              userId: user.id,
              data: { protocolId: id },
            },
          });
        }
      }
    }
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action:
          doc.type === "HANDOVER"
            ? "HANDOVER_CONFIRMED"
            : "EQUIPMENT_OUT_OF_SERVICE",
        entityType: "OperationalProtocol",
        entityId: id,
        newValue: { eventDate: eventDate.toISOString() },
      },
    });
  }, transactionOptions);
  revalidatePath(`/protokoly/provozni/${id}`);
  revalidatePath("/prostredky");
}

export async function returnHandoverItem(form: FormData) {
  const user = await requireOperationalPermission("handover:return");
  const movementId = value(form, "movementId");
  const returnedAt = parseDateOnly(form.get("returnedAt"), "Datum vrácení");
  if (dateKey(returnedAt) > todayDateKey())
    throw new Error("Vrácení nesmí být v budoucnosti.");
  await prisma.$transaction(async (tx) => {
    const movement = await tx.handoverMovement.findUnique({
      where: { id: movementId },
      include: { item: { include: { protocol: true } } },
    });
    if (
      !movement ||
      movement.item.protocol.organizationId !== user.organizationId
    )
      throw new Error("Předání není dostupné.");
    if (movement.returnedAt) return;
    if (returnedAt < movement.handedOverAt)
      throw new Error("Vrácení nesmí předcházet předání.");
    const returnData = {
      condition: value(form, "condition"),
      accessories: value(form, "accessories"),
      defects: value(form, "defects"),
      note: value(form, "note"),
    };
    if (!returnData.condition) throw new Error("Stav při vrácení je povinný.");
    const locationId = value(form, "locationId"),
      vehicleId = value(form, "vehicleId");
    if (
      locationId &&
      !(await tx.location.findFirst({
        where: {
          id: locationId,
          station: { organizationId: user.organizationId },
        },
      }))
    )
      throw new Error("Umístění není dostupné.");
    if (
      vehicleId &&
      !(await tx.vehicle.findFirst({
        where: {
          id: vehicleId,
          station: { organizationId: user.organizationId },
        },
      }))
    )
      throw new Error("Vozidlo není dostupné.");
    await tx.handoverMovement.update({
      where: { id: movementId },
      data: { returnedAt, returnedById: user.id, returnData },
    });
    await tx.equipmentItem.update({
      where: { id: movement.equipmentId },
      data: {
        status: "AWAITING_INSPECTION",
        ...(vehicleId
          ? { vehicleId, locationId: null }
          : locationId
            ? { locationId, vehicleId: null }
            : {}),
      },
    });
    const repairCaseId = (
      movement.item.protocol.draftData as Record<string, string>
    ).repairCaseId;
    if (repairCaseId) {
      const repair = await tx.repairCase.findFirst({
        where: {
          id: repairCaseId,
          equipmentId: movement.equipmentId,
          organizationId: user.organizationId,
          state: { in: ["REPAIR_COMPLETED", "AWAITING_COLLECTION"] },
        },
      });
      if (repair) {
        await tx.repairCase.update({
          where: { id: repair.id },
          data: { state: "AWAITING_INSPECTION" },
        });
        await tx.repairEvent.create({
          data: {
            repairCaseId: repair.id,
            previousState: repair.state,
            newState: "AWAITING_INSPECTION",
            userId: user.id,
            note: "Převzetí ze servisu",
          },
        });
      }
    }
    if (returnData.defects)
      await tx.defect.create({
        data: {
          equipmentId: movement.equipmentId,
          description: returnData.defects,
          reportedById: user.id,
          severity: "SIGNIFICANT",
        },
      });
    await tx.equipmentLogEntry.create({
      data: {
        equipmentId: movement.equipmentId,
        eventType: "OTHER",
        occurredAt: returnedAt,
        description: `Vrácení prostředku: ${returnData.condition}. ${returnData.note}`,
        createdById: user.id,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "EQUIPMENT_RETURNED",
        entityType: "EquipmentItem",
        entityId: movement.equipmentId,
        newValue: {
          movementId,
          returnedAt: returnedAt.toISOString(),
          ...returnData,
        },
      },
    });
  }, transactionOptions);
  revalidatePath("/protokoly");
  revalidatePath("/prostredky");
}

export async function submitRepairProposal(form: FormData) {
  const user = await requireOperationalPermission("repair:create");
  const id = value(form, "id");
  await prisma.$transaction(async (tx) => {
    const doc = await tx.operationalProtocol.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        type: "REPAIR_PROPOSAL",
        status: "ISSUED",
      },
      include: { items: true },
    });
    if (!doc || doc.items.length !== 1)
      throw new Error("Nejprve vystavte návrh pro jeden prostředek.");
    if (
      await tx.auditLog.findFirst({
        where: {
          action: "REPAIR_SUBMITTED",
          entityType: "OperationalProtocol",
          entityId: id,
        },
      })
    )
      return;
    const data = doc.draftData as Record<string, string>;
    if (!data.description || !data.solution || !data.justification)
      throw new Error(
        "Doplňte popis závady, navrhovanou opravu a odůvodnění před vystavením.",
      );
    const equipmentId = doc.items[0].equipmentId;
    const predecessor = doc.relatedProtocolId
      ? await tx.operationalProtocol.findFirst({
          where: {
            id: doc.relatedProtocolId,
            organizationId: user.organizationId,
            type: "REPAIR_PROPOSAL",
          },
          include: { decisions: true },
        })
      : null;
    const priorDecision = predecessor?.decisions.find(
      (d) => d.decision === "APPROVED",
    );
    const priorRepair = priorDecision
      ? await tx.repairCase.findFirst({
          where: {
            id: priorDecision.repairCaseId,
            equipmentId,
            organizationId: user.organizationId,
          },
        })
      : null;
    let defect = priorRepair
      ? await tx.defect.findUnique({ where: { id: priorRepair.defectId } })
      : await tx.defect.findFirst({
          where: {
            equipmentId,
            closedAt: null,
            ...(data.relatedDefectId ? { id: data.relatedDefectId } : {}),
          },
          orderBy: { foundAt: "desc" },
        });
    if (!defect)
      defect = await tx.defect.create({
        data: {
          equipmentId,
          reportedById: user.id,
          description: data.description,
          severity: "SIGNIFICANT",
        },
      });
    const existing = await tx.repairCase.findUnique({
      where: { defectId: defect.id },
    });
    const supplemental = Boolean(
      predecessor?.decisions.some((d) => d.decision === "APPROVED"),
    );
    if (
      existing &&
      !["PROPOSAL_REQUIRED", "CHANGES_REQUIRED", "REJECTED"].includes(
        existing.state,
      ) &&
      !(
        supplemental &&
        !["CLOSED", "CANCELLED", "PENDING_APPROVAL"].includes(existing.state)
      )
    )
      throw new Error(
        "Závada už má aktivní návrh nebo opravu. Dodatečné schválení vytvořte jako novou verzi schváleného návrhu.",
      );
    const estimate = data.estimatedCost ? money(data.estimatedCost) : null;
    if (estimate?.isNegative())
      throw new Error("Předpokládaná cena nesmí být záporná.");
    const repair = existing
      ? await tx.repairCase.update({
          where: { id: existing.id },
          data: { state: "PENDING_APPROVAL", estimatedCost: estimate },
        })
      : await tx.repairCase.create({
          data: {
            organizationId: user.organizationId,
            equipmentId,
            defectId: defect.id,
            state: "PENDING_APPROVAL",
            responsibleUserId: user.id,
            estimatedCost: estimate,
            currency: data.currency || "CZK",
            dueAt: data.dueDate
              ? parseDateOnly(data.dueDate, "Termín opravy")
              : null,
          },
        });
    // The association is stored separately: issued document contents stay immutable.
    await tx.repairEvent.create({
      data: {
        repairCaseId: repair.id,
        previousState: existing?.state,
        newState: "PENDING_APPROVAL",
        userId: user.id,
        data: {
          protocolId: id,
          resumeState: supplemental ? existing?.state : undefined,
        },
        note: "Návrh odeslán ke schválení",
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "REPAIR_SUBMITTED",
        entityType: "OperationalProtocol",
        entityId: id,
        newValue: { repairCaseId: repair.id },
      },
    });
  }, transactionOptions);
  revalidatePath(`/protokoly/provozni/${id}`);
  revalidatePath("/zavady");
}

export async function duplicateOperationalProtocol(form: FormData) {
  const user = await requireOperationalPermission("protocol:create");
  await requireOperationalPermission("protocol:read");
  const sourceId = value(form, "id");
  const copy = await prisma.$transaction(async (tx) => {
    const source = await tx.operationalProtocol.findFirst({
      where: { id: sourceId, organizationId: user.organizationId },
      include: { items: true },
    });
    if (!source) throw new Error("Původní dokument není dostupný.");
    const copy = await tx.operationalProtocol.create({
      data: {
        organizationId: user.organizationId,
        type: source.type,
        title: source.title,
        createdById: user.id,
        protocolDate: parseDateOnly(todayDateKey(), "Datum protokolu"),
        relatedProtocolId: sourceId,
        version: source.version + 1,
        supplierId: source.supplierId,
        relatedInspectionId: source.relatedInspectionId,
        draftData: {
          ...(source.draftData as Record<string, string>),
          relatedProtocolId: sourceId,
        },
        items: {
          create: source.items.map((item) => ({
            equipmentId: item.equipmentId,
            quantity: item.quantity,
            details: item.details as Prisma.InputJsonValue,
          })),
        },
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "PROTOCOL_CREATED",
        entityType: "OperationalProtocol",
        entityId: copy.id,
        newValue: { relatedProtocolId: sourceId, version: copy.version },
      },
    });
    return copy;
  });
  redirect(`/protokoly/provozni/${copy.id}`);
}

export async function acknowledgeHandover(form: FormData) {
  const user = await requireOperationalPermission("handover:confirm");
  const id = value(form, "id");
  await prisma.$transaction(async (tx) => {
    const doc = await tx.operationalProtocol.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        type: "HANDOVER",
        status: "ISSUED",
      },
    });
    if (
      !doc ||
      (doc.draftData as Record<string, string>).recipientUserId !== user.id
    )
      throw new Error(
        "Převzetí může elektronicky potvrdit pouze zvolený interní příjemce.",
      );
    if (
      !(await tx.auditLog.findFirst({
        where: {
          entityId: id,
          entityType: "OperationalProtocol",
          action: "HANDOVER_CONFIRMED",
        },
      }))
    )
      throw new Error("Nejprve potvrďte skutečné předání.");
    if (
      await tx.auditLog.findFirst({
        where: {
          entityId: id,
          entityType: "OperationalProtocol",
          action: "HANDOVER_ACCEPTED",
        },
      })
    )
      return;
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "HANDOVER_ACCEPTED",
        entityType: "OperationalProtocol",
        entityId: id,
        newValue: {
          name: user.displayName,
          acceptedAt: new Date().toISOString(),
        },
      },
    });
  }, transactionOptions);
  revalidatePath(`/protokoly/provozni/${id}`);
}
