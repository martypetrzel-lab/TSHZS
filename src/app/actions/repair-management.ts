"use server";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireOperationalPermission } from "@/lib/operational-authorization";
import { prisma } from "@/lib/prisma";
import {
  parseDateOnly,
  todayDateKey,
  dateKey,
} from "@/lib/inspection-lifecycle";
import { money, repairCostTotal } from "@/lib/operational-money";
import { assertReturnToService } from "@/lib/operational-workflow";
import { canUserPerformInspection } from "@/lib/inspection-permissions";
const val = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export async function saveSupplier(form: FormData) {
  const user = await requireOperationalPermission("supplier:manage");
  const data = Object.fromEntries(
    [
      "name",
      "companyId",
      "taxId",
      "address",
      "contactName",
      "phone",
      "email",
      "specialization",
      "note",
    ].map((key) => [key, val(form, key)]),
  );
  if (!data.name) throw new Error("Název organizace je povinný.");
  const id = val(form, "id");
  await prisma.$transaction(async (tx) => {
    if (
      id &&
      !(await tx.serviceSupplier.findFirst({
        where: { id, organizationId: user.organizationId },
      }))
    )
      throw new Error("Organizace není dostupná.");
    const saved = id
      ? await tx.serviceSupplier.update({
          where: { id },
          data: { ...data, name: data.name },
        })
      : await tx.serviceSupplier.create({
          data: {
            ...data,
            name: data.name,
            organizationId: user.organizationId,
          },
        });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "SUPPLIER_UPDATED",
        entityType: "ServiceSupplier",
        entityId: saved.id,
        newValue: data,
      },
    });
  });
  revalidatePath("/dodavatele");
}

export async function updateRepairDetails(form: FormData) {
  const user = await requireOperationalPermission("repair:manage");
  const id = val(form, "repairCaseId");
  const reason = val(form, "reason");
  if (!reason) throw new Error("Důvod změny je povinný.");
  const dueAt = val(form, "dueAt")
    ? parseDateOnly(form.get("dueAt"), "Termín opravy")
    : null;
  const supplierId = val(form, "supplierId") || null;
  const responsibleUserId = val(form, "responsibleUserId");
  await prisma.$transaction(
    async (tx) => {
      const current = await tx.repairCase.findFirst({
        where: { id, organizationId: user.organizationId },
      });
      if (!current || ["CLOSED", "CANCELLED"].includes(current.state))
        throw new Error("Opravu nelze upravit.");
      if (
        supplierId &&
        !(await tx.serviceSupplier.findFirst({
          where: {
            id: supplierId,
            organizationId: user.organizationId,
            archivedAt: null,
          },
        }))
      )
        throw new Error("Dodavatel není dostupný.");
      if (
        !(await tx.user.findFirst({
          where: {
            id: responsibleUserId,
            organizationId: user.organizationId,
            active: true,
          },
        }))
      )
        throw new Error("Vyberte odpovědnou osobu.");
      await tx.repairCase.update({
        where: { id },
        data: {
          dueAt,
          supplierId,
          responsibleUserId,
          orderNumber: val(form, "orderNumber") || null,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "REPAIR_DEADLINE_CHANGED",
          entityType: "RepairCase",
          entityId: id,
          reason,
          previousValue: {
            dueAt: current.dueAt?.toISOString() ?? null,
            supplierId: current.supplierId,
          },
          newValue: {
            dueAt: dueAt?.toISOString() ?? null,
            supplierId,
            responsibleUserId,
          },
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
  revalidatePath(`/zavady/${id}`);
  revalidatePath("/kalendar");
}

export async function saveRepairCosts(form: FormData) {
  const user = await requireOperationalPermission("repair:costs_edit");
  const id = val(form, "repairCaseId");
  const parts = ["laborCost", "partsCost", "transportCost", "otherCost"];
  const actualCost = repairCostTotal(parts.map((key) => val(form, key)));
  const currency = val(form, "currency");
  if (!/^[A-Z]{3}$/.test(currency))
    throw new Error("Zadejte třípísmennou měnu.");
  await prisma.$transaction(
    async (tx) => {
      const current = await tx.repairCase.findFirst({
        where: { id, organizationId: user.organizationId },
      });
      if (!current || current.state === "CLOSED")
        throw new Error("Náklady této opravy nelze měnit.");
      if (current.approvedLimit && currency !== current.currency)
        throw new Error(
          "Schválený limit je v jiné měně. Vyžaduje nové schválení.",
        );
      const vatRate = val(form, "vatRate") ? money(val(form, "vatRate")) : null;
      if (vatRate?.gt(100)) throw new Error("Sazba DPH musí být od 0 do 100.");
      await tx.repairCase.update({
        where: { id },
        data: {
          actualCost,
          laborCost: money(val(form, "laborCost") || "0"),
          partsCost: money(val(form, "partsCost") || "0"),
          transportCost: money(val(form, "transportCost") || "0"),
          otherCost: money(val(form, "otherCost") || "0"),
          currency,
          vatRate,
          invoiceNumber: val(form, "invoiceNumber") || null,
          invoiceDate: val(form, "invoiceDate")
            ? parseDateOnly(form.get("invoiceDate"), "Datum faktury")
            : null,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "REPAIR_COST_CHANGED",
          entityType: "RepairCase",
          entityId: id,
          previousValue: { actualCost: current.actualCost?.toFixed(2) ?? null },
          newValue: {
            actualCost: actualCost.toFixed(2),
            currency,
            exceedsLimit: Boolean(
              current.approvedLimit && actualCost.gt(current.approvedLimit),
            ),
          },
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
  revalidatePath(`/zavady/${id}`);
  revalidatePath("/zavady/statistiky");
}

export async function closeRepairedDefect(form: FormData) {
  const user = await requireOperationalPermission("repair:manage");
  const id = val(form, "repairCaseId"),
    reason = val(form, "reason");
  if (!reason) throw new Error("Popis odstranění závady je povinný.");
  await prisma.$transaction(async (tx) => {
    const repair = await tx.repairCase.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        state: {
          in: [
            "REPAIR_COMPLETED",
            "AWAITING_COLLECTION",
            "AWAITING_INSPECTION",
          ],
        },
      },
    });
    if (!repair) throw new Error("Nejprve zaznamenejte dokončení opravy.");
    if (
      !(await tx.attachment.findFirst({
        where: {
          ownerType: "RepairCase:SERVICE_REPORT",
          ownerId: id,
          archivedAt: null,
        },
      }))
    )
      throw new Error("Nejprve přiložte servisní zprávu.");
    await tx.defect.update({
      where: { id: repair.defectId },
      data: { closedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "DEFECT_RESOLVED",
        entityType: "EquipmentItem",
        entityId: repair.equipmentId,
        reason,
        newValue: { defectId: repair.defectId, repairCaseId: id },
      },
    });
  });
  revalidatePath(`/zavady/${id}`);
}

export async function returnEquipmentToService(form: FormData) {
  const user = await requireOperationalPermission(
    "equipment:return_to_service",
  );
  const id = val(form, "repairCaseId"),
    inspectionId = val(form, "inspectionId");
  await prisma.$transaction(
    async (tx) => {
      const repair = await tx.repairCase.findFirst({
        where: { id, organizationId: user.organizationId },
        include: { events: true },
      });
      if (!repair) throw new Error("Oprava není dostupná.");
      if (repair.state === "CLOSED") return;
      if (repair.state !== "AWAITING_INSPECTION")
        throw new Error("Oprava nečeká na kontrolu po opravě.");
      const completedEvent = repair.events
        .filter((e) => e.newState === "REPAIR_COMPLETED")
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      const inspection = await tx.inspection.findFirst({
        where: {
          id: inspectionId,
          equipmentId: repair.equipmentId,
          state: "CLOSED",
          result: { in: ["PASSED", "PASSED_WITH_LIMITATION"] },
          completedAt: { gte: completedEvent?.createdAt ?? repair.createdAt },
        },
        include: { requirement: { include: { ruleVersion: true } } },
      });
      if (
        !inspection?.performedAt ||
        dateKey(inspection.performedAt) <
          dateKey(completedEvent?.createdAt ?? repair.createdAt)
      )
        throw new Error("Datum fyzické kontroly předchází dokončení opravy.");
      if (
        !inspection?.requirement ||
        !canUserPerformInspection(user, inspection.requirement)
      )
        throw new Error(
          "Chybí platná kontrola po opravě nebo odborné oprávnění potvrzující osoby.",
        );
      if (
        repair.actualCost &&
        repair.approvedLimit &&
        repair.actualCost.gt(repair.approvedLimit)
      )
        throw new Error(
          "Skutečná cena překročila limit. Vyžádejte dodatečné schválení.",
        );
      const requirements = await tx.equipmentRequirement.findMany({
        where: { equipmentId: repair.equipmentId, archivedAt: null },
      });
      const blocking = requirements.filter(
        (r) =>
          r.status === "OVERDUE_BLOCKED" ||
          (r.nextDueAt && dateKey(r.nextDueAt) < todayDateKey()) ||
          ((r.type === "REVISION" || r.trigger === "AFTER_REPAIR") &&
            !r.lastCompletedAt) ||
          (r.trigger === "AFTER_REPAIR" &&
            r.lastCompletedAt &&
            dateKey(r.lastCompletedAt) <
              dateKey(completedEvent?.createdAt ?? repair.createdAt)),
      );
      const otherRepairs = await tx.repairCase.count({
        where: {
          equipmentId: repair.equipmentId,
          id: { not: id },
          state: { notIn: ["CLOSED", "CANCELLED", "REJECTED"] },
        },
      });
      assertReturnToService({
        blockingDefects:
          (await tx.defect.count({
            where: { equipmentId: repair.equipmentId, closedAt: null },
          })) + otherRepairs,
        blockingRequirements: blocking.length,
        activeHandovers: await tx.handoverMovement.count({
          where: { equipmentId: repair.equipmentId, returnedAt: null },
        }),
        passedInspection: Boolean(inspection),
        serviceReport: Boolean(
          await tx.attachment.findFirst({
            where: {
              ownerType: "RepairCase:SERVICE_REPORT",
              ownerId: id,
              archivedAt: null,
            },
          }),
        ),
      });
      const equipment = await tx.equipmentItem.findUniqueOrThrow({
        where: { id: repair.equipmentId },
      });
      await tx.repairCase.update({
        where: { id },
        data: { state: "CLOSED", completedAt: new Date() },
      });
      await tx.equipmentItem.update({
        where: { id: equipment.id },
        data: { status: "IN_SERVICE", complianceStatus: "COMPLIANT" },
      });
      await tx.equipmentStatusHistory.create({
        data: {
          equipmentId: equipment.id,
          fromStatus: equipment.status,
          toStatus: "IN_SERVICE",
          reason: "Kontrola po opravě a ověření podmínek",
          changedById: user.id,
        },
      });
      await tx.repairEvent.create({
        data: {
          repairCaseId: id,
          previousState: repair.state,
          newState: "CLOSED",
          userId: user.id,
          data: { inspectionId },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "EQUIPMENT_RETURNED_TO_SERVICE",
          entityType: "EquipmentItem",
          entityId: equipment.id,
          previousValue: { status: equipment.status },
          newValue: { status: "IN_SERVICE", repairCaseId: id, inspectionId },
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  revalidatePath(`/zavady/${id}`);
  revalidatePath("/prostredky");
  revalidatePath("/");
}

export async function changeReturnDeadline(form: FormData) {
  const user = await requireOperationalPermission("handover:confirm");
  const id = val(form, "movementId"),
    reason = val(form, "reason");
  if (!reason) throw new Error("Důvod změny je povinný.");
  const expectedReturnAt = parseDateOnly(
    form.get("expectedReturnAt"),
    "Termín vrácení",
  );
  await prisma.$transaction(async (tx) => {
    const movement = await tx.handoverMovement.findUnique({
      where: { id },
      include: { item: { include: { protocol: true } } },
    });
    if (
      !movement ||
      movement.returnedAt ||
      movement.item.protocol.organizationId !== user.organizationId
    )
      throw new Error("Aktivní předání není dostupné.");
    if (expectedReturnAt < movement.handedOverAt)
      throw new Error("Termín vrácení nesmí předcházet předání.");
    await tx.handoverMovement.update({
      where: { id },
      data: { expectedReturnAt },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "HANDOVER_DEADLINE_CHANGED",
        entityType: "OperationalProtocol",
        entityId: movement.item.protocolId,
        reason,
        previousValue: {
          expectedReturnAt: movement.expectedReturnAt?.toISOString() ?? null,
        },
        newValue: {
          expectedReturnAt: expectedReturnAt.toISOString(),
          equipmentId: movement.equipmentId,
        },
      },
    });
  });
  revalidatePath("/kalendar");
  revalidatePath("/protokoly");
}
