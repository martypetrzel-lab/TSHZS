"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireEquipmentEditor } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

const statuses = [
  "IN_SERVICE",
  "OUT_OF_SERVICE",
  "IN_REPAIR",
  "AWAITING_INSPECTION",
  "AWAITING_REVISION",
  "LOANED",
  "IN_STOCK",
  "RETIRED",
  "LOST",
] as const;
const types = [
  "INSPECTION",
  "REVISION",
  "CALIBRATION",
  "VERIFICATION",
  "LIFETIME",
  "EXPIRATION",
] as const;
const units = ["DAYS", "WEEKS", "MONTHS", "YEARS"] as const;
const itemSchema = z.object({
  equipmentId: z.string().min(1),
  name: z.string().trim().min(2),
  legacyId: z.string().trim().optional(),
  categoryId: z.string().min(1),
  manufacturer: z.string().trim().optional(),
  model: z.string().trim().optional(),
  typeName: z.string().trim().optional(),
  serialNumber: z.string().trim().optional(),
  registrationNumber: z.string().trim().optional(),
  placement: z.string(),
  status: z.enum(statuses),
  manufacturedAt: z.string().optional(),
  registeredAt: z.string().optional(),
  acquiredAt: z.string().optional(),
  warrantyUntil: z.string().optional(),
  lifetimeUntil: z.string().optional(),
  note: z.string().trim().optional(),
});
const dateOnly = (value: string | undefined) =>
  value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00.000Z`)
    : null;
const empty = (value: string | undefined) => value || null;
const dueStatus = (date: Date | null) =>
  !date
    ? ("UNDEFINED" as const)
    : date < new Date()
      ? ("OVERDUE_BLOCKED" as const)
      : date.getTime() - Date.now() <= 30 * 86400000
        ? ("DUE_SOON" as const)
        : ("COMPLIANT" as const);
function placement(value: string) {
  if (value.startsWith("vehicle:"))
    return { vehicleId: value.slice(8), locationId: null };
  if (value.startsWith("location:"))
    return { vehicleId: null, locationId: value.slice(9) };
  return { vehicleId: null, locationId: null };
}

export async function updateEquipmentReview(formData: FormData) {
  const user = await requireEquipmentEditor();
  const parsed = itemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    redirect(
      `/prostredky/${String(formData.get("equipmentId"))}/upravit?chyba=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Neplatné údaje")}`,
    );
  const item = await prisma.equipmentItem.findUnique({
    where: { id: parsed.data.equipmentId },
    include: {
      requirements: {
        where: { archivedAt: null },
        include: { _count: { select: { history: true } } },
      },
      vehicle: true,
      location: true,
      category: true,
    },
  });
  if (!item) redirect("/prostredky");
  const targetPlacement = placement(parsed.data.placement);
  const reviewed = formData.get("reviewed") === "on";
  const intent = String(formData.get("intent") ?? "save");
  await prisma.$transaction(async (tx) => {
    const previous = {
      name: item.name,
      legacyId: item.legacyId,
      categoryId: item.categoryId,
      manufacturer: item.manufacturer,
      model: item.model,
      typeName: item.typeName,
      serialNumber: item.serialNumber,
      registrationNumber: item.registrationNumber,
      vehicleId: item.vehicleId,
      locationId: item.locationId,
      status: item.status,
      manufacturedAt: item.manufacturedAt,
      registeredAt: item.registeredAt,
      acquiredAt: item.acquiredAt,
      warrantyUntil: item.warrantyUntil,
      lifetimeUntil: item.lifetimeUntil,
      note: item.note,
      needsReview: item.needsReview,
    };
    const data = {
      name: parsed.data.name,
      legacyId: empty(parsed.data.legacyId),
      categoryId: parsed.data.categoryId,
      manufacturer: empty(parsed.data.manufacturer),
      model: empty(parsed.data.model),
      typeName: empty(parsed.data.typeName),
      serialNumber: empty(parsed.data.serialNumber),
      registrationNumber: empty(parsed.data.registrationNumber),
      ...targetPlacement,
      status: parsed.data.status,
      manufacturedAt: dateOnly(parsed.data.manufacturedAt),
      registeredAt: dateOnly(parsed.data.registeredAt) ?? item.registeredAt,
      acquiredAt: dateOnly(parsed.data.acquiredAt),
      warrantyUntil: dateOnly(parsed.data.warrantyUntil),
      lifetimeUntil: dateOnly(parsed.data.lifetimeUntil),
      note: empty(parsed.data.note),
      needsReview: reviewed ? false : item.needsReview,
    };
    await tx.equipmentItem.update({ where: { id: item.id }, data });
    if (item.status !== parsed.data.status)
      await tx.equipmentStatusHistory.create({
        data: {
          equipmentId: item.id,
          fromStatus: item.status,
          toStatus: parsed.data.status,
          reason: "Ruční editace prostředku",
          changedById: user.id,
        },
      });
    if (
      item.vehicleId !== data.vehicleId ||
      item.locationId !== data.locationId
    )
      await tx.equipmentLocationHistory.create({
        data: {
          equipmentId: item.id,
          fromLocationId: item.locationId,
          toLocationId: data.locationId,
          fromVehicleId: item.vehicleId,
          toVehicleId: data.vehicleId,
          reason: "Ruční změna umístění",
          changedById: user.id,
        },
      });
    for (const requirement of item.requirements) {
      if (formData.get(`archive-${requirement.id}`) === "on") {
        await tx.equipmentRequirement.update({
          where: { id: requirement.id },
          data: { archivedAt: new Date() },
        });
        continue;
      }
      const name =
        String(
          formData.get(`name-${requirement.id}`) ?? requirement.name,
        ).trim() || requirement.name;
      const type = String(
        formData.get(`type-${requirement.id}`) ?? requirement.type,
      );
      const interval = Number(formData.get(`intervalValue-${requirement.id}`));
      const unit = String(formData.get(`intervalUnit-${requirement.id}`) ?? "");
      const last = dateOnly(
        String(formData.get(`lastCompletedAt-${requirement.id}`) ?? ""),
      );
      const next = dateOnly(
        String(formData.get(`nextDueAt-${requirement.id}`) ?? ""),
      );
      const note = empty(String(formData.get(`note-${requirement.id}`) ?? ""));
      const updated = await tx.equipmentRequirement.update({
        where: { id: requirement.id },
        data: {
          name,
          type: types.includes(type as never)
            ? (type as never)
            : requirement.type,
          intervalValue:
            Number.isInteger(interval) && interval > 0 ? interval : null,
          intervalUnit: units.includes(unit as never) ? (unit as never) : null,
          lastCompletedAt: last,
          nextDueAt: next,
          status: dueStatus(next),
          note,
          needsReview: false,
        },
      });
      await tx.equipmentRequirementHistory.create({
        data: {
          requirementId: updated.id,
          lastCompletedAt: last,
          nextDueAt: next,
          intervalValue: updated.intervalValue,
          intervalUnit: updated.intervalUnit,
          status: updated.status,
          source: "Ruční editace",
          note: "Povinnost upravena.",
          recordedById: user.id,
        },
      });
    }
    if (formData.get("addRequirement") === "on") {
      const type = String(formData.get("newType") ?? "INSPECTION");
      const interval = Number(formData.get("newIntervalValue"));
      const unit = String(formData.get("newIntervalUnit") ?? "MONTHS");
      const last = dateOnly(String(formData.get("newLastCompletedAt") ?? ""));
      const next = dateOnly(String(formData.get("newNextDueAt") ?? ""));
      const created = await tx.equipmentRequirement.create({
        data: {
          equipmentId: item.id,
          name:
            String(formData.get("newName") ?? "").trim() || "Nová povinnost",
          type: types.includes(type as never) ? (type as never) : "INSPECTION",
          intervalValue:
            Number.isInteger(interval) && interval > 0 ? interval : null,
          intervalUnit: units.includes(unit as never) ? (unit as never) : null,
          lastCompletedAt: last,
          nextDueAt: next,
          status: dueStatus(next),
          source: "Ručně zadaná povinnost",
          sourceType: "INDIVIDUAL",
          note: empty(String(formData.get("newNote") ?? "")),
        },
      });
      await tx.equipmentRequirementHistory.create({
        data: {
          requirementId: created.id,
          lastCompletedAt: last,
          nextDueAt: next,
          intervalValue: created.intervalValue,
          intervalUnit: created.intervalUnit,
          status: created.status,
          source: "Ruční editace",
          note: "Povinnost vytvořena.",
          recordedById: user.id,
        },
      });
    }
    const active = await tx.equipmentRequirement.findMany({
      where: { equipmentId: item.id, archivedAt: null },
      select: { status: true },
    });
    const complianceStatus = active.some((r) => r.status === "OVERDUE_BLOCKED")
      ? "OVERDUE_BLOCKED"
      : active.some((r) => r.status === "DUE_SOON" || r.status === "WARNING")
        ? "DUE_SOON"
        : active.some((r) => r.status === "COMPLIANT")
          ? "COMPLIANT"
          : "UNDEFINED";
    await tx.equipmentItem.update({
      where: { id: item.id },
      data: { complianceStatus },
    });
    const previousJson = JSON.parse(JSON.stringify(previous)) as Record<
      string,
      unknown
    >;
    const newJson = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
    const changedKeys = Object.keys(newJson).filter(
      (key) =>
        JSON.stringify(previousJson[key]) !== JSON.stringify(newJson[key]),
    );
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE",
        entityType: "EquipmentItem",
        entityId: item.id,
        previousValue: Object.fromEntries(
          changedKeys.map((key) => [key, previousJson[key] ?? null]),
        ),
        newValue: Object.fromEntries(
          changedKeys.map((key) => [key, newJson[key] ?? null]),
        ),
        reason: "Editace karty prostředku",
      },
    });
  });
  revalidatePath(`/prostredky/${item.id}`);
  revalidatePath("/prostredky");
  if (intent === "next") {
    const next = await prisma.equipmentItem.findFirst({
      where: { needsReview: true, archivedAt: null, id: { not: item.id } },
      orderBy: { updatedAt: "asc" },
      select: { id: true },
    });
    redirect(
      next ? `/prostredky/${next.id}/upravit` : `/prostredky?review=1&hotovo=1`,
    );
  }
  redirect(`/prostredky/${item.id}`);
}

export async function bulkUpdateEquipment(formData: FormData) {
  const user = await requireEquipmentEditor();
  const ids = formData
    .getAll("selected")
    .map(String)
    .filter(Boolean)
    .slice(0, 500);
  if (!ids.length)
    redirect(
      "/prostredky?chyba=Vyberte%20alespo%C5%88%20jeden%20prost%C5%99edek.",
    );
  const categoryId =
    formData.get("applyCategory") === "on"
      ? String(formData.get("bulkCategoryId") ?? "")
      : null;
  const target =
    formData.get("applyPlacement") === "on"
      ? placement(String(formData.get("bulkPlacement") ?? "none"))
      : null;
  const status =
    formData.get("applyStatus") === "on"
      ? String(formData.get("bulkStatus") ?? "")
      : null;
  const review =
    formData.get("applyReview") === "on"
      ? String(formData.get("bulkReview")) === "true"
      : null;
  await prisma.$transaction(async (tx) => {
    const items = await tx.equipmentItem.findMany({
      where: { id: { in: ids }, archivedAt: null },
    });
    for (const item of items) {
      const data = {
        ...(categoryId ? { categoryId } : {}),
        ...(target ?? {}),
        ...(status && statuses.includes(status as never)
          ? { status: status as never }
          : {}),
        ...(review !== null ? { needsReview: review } : {}),
      };
      await tx.equipmentItem.update({ where: { id: item.id }, data });
      if (
        status &&
        status !== item.status &&
        statuses.includes(status as never)
      )
        await tx.equipmentStatusHistory.create({
          data: {
            equipmentId: item.id,
            fromStatus: item.status,
            toStatus: status as never,
            reason: "Hromadná úprava",
            changedById: user.id,
          },
        });
      if (
        target &&
        (target.vehicleId !== item.vehicleId ||
          target.locationId !== item.locationId)
      )
        await tx.equipmentLocationHistory.create({
          data: {
            equipmentId: item.id,
            fromLocationId: item.locationId,
            toLocationId: target.locationId,
            fromVehicleId: item.vehicleId,
            toVehicleId: target.vehicleId,
            reason: "Hromadná úprava",
            changedById: user.id,
          },
        });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "BULK_UPDATE",
          entityType: "EquipmentItem",
          entityId: item.id,
          previousValue: {
            categoryId: item.categoryId,
            vehicleId: item.vehicleId,
            locationId: item.locationId,
            status: item.status,
            needsReview: item.needsReview,
          },
          newValue: data,
          reason: "Hromadná úprava prostředků",
        },
      });
    }
  });
  revalidatePath("/prostredky");
  redirect("/prostredky?ulozeno=1");
}
