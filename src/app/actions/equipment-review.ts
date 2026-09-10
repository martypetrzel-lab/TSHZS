"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const itemSchema = z.object({
  equipmentId: z.string().min(1),
  name: z.string().trim().min(2),
  categoryId: z.string().min(1),
  manufacturer: z.string().trim().optional(),
  model: z.string().trim().optional(),
  serialNumber: z.string().trim().optional(),
  registrationNumber: z.string().trim().optional(),
  locationId: z.string().optional(),
});
const allowedTypes = new Set([
  "INSPECTION",
  "REVISION",
  "CALIBRATION",
  "VERIFICATION",
  "LIFETIME",
  "EXPIRATION",
]);
const allowedUnits = new Set(["DAYS", "WEEKS", "MONTHS", "YEARS"]);
const dateOnly = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00.000Z`) : null;

export async function updateEquipmentReview(formData: FormData) {
  const user = await requireUser();
  const parsed = itemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    redirect(
      `/prostredky/${String(formData.get("equipmentId"))}/upravit?chyba=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Neplatné údaje")}`,
    );
  const item = await prisma.equipmentItem.findUnique({
    where: { id: parsed.data.equipmentId },
    include: { requirements: true },
  });
  if (!item) redirect("/prostredky");
  await prisma.$transaction(async (tx) => {
    await tx.equipmentItem.update({
      where: { id: item.id },
      data: {
        name: parsed.data.name,
        categoryId: parsed.data.categoryId,
        manufacturer: parsed.data.manufacturer || null,
        model: parsed.data.model || null,
        serialNumber: parsed.data.serialNumber || null,
        registrationNumber: parsed.data.registrationNumber || null,
        locationId: parsed.data.locationId || null,
        vehicleId: parsed.data.locationId ? null : undefined,
        needsReview: false,
      },
    });
    for (const requirement of item.requirements) {
      const type = String(
        formData.get(`type-${requirement.id}`) ?? requirement.type,
      );
      const intervalValueRaw = String(
        formData.get(`intervalValue-${requirement.id}`) ?? "",
      );
      const intervalUnit = String(
        formData.get(`intervalUnit-${requirement.id}`) ?? "",
      );
      const nextDueAt = dateOnly(
        String(formData.get(`nextDueAt-${requirement.id}`) ?? ""),
      );
      const intervalValue = Number(intervalValueRaw);
      const status = !nextDueAt
        ? "UNDEFINED"
        : nextDueAt < new Date()
          ? "OVERDUE_BLOCKED"
          : nextDueAt.getTime() - Date.now() <= 30 * 86_400_000
            ? "DUE_SOON"
            : "COMPLIANT";
      const updated = await tx.equipmentRequirement.update({
        where: { id: requirement.id },
        data: {
          type: allowedTypes.has(type) ? (type as never) : requirement.type,
          intervalValue:
            Number.isInteger(intervalValue) && intervalValue > 0
              ? intervalValue
              : null,
          intervalUnit: allowedUnits.has(intervalUnit)
            ? (intervalUnit as never)
            : null,
          nextDueAt,
          status,
          needsReview: false,
        },
      });
      await tx.equipmentRequirementHistory.create({
        data: {
          requirementId: updated.id,
          lastCompletedAt: updated.lastCompletedAt,
          nextDueAt: updated.nextDueAt,
          intervalValue: updated.intervalValue,
          intervalUnit: updated.intervalUnit,
          status: updated.status,
          source: "Ruční doplnění",
          note: "Údaje povinnosti upraveny na kartě prostředku.",
          recordedById: user.id,
        },
      });
    }
    const requirementStatuses = await tx.equipmentRequirement.findMany({
      where: { equipmentId: item.id },
      select: { status: true },
    });
    const complianceStatus = requirementStatuses.some(
      (row) => row.status === "OVERDUE_BLOCKED",
    )
      ? "OVERDUE_BLOCKED"
      : requirementStatuses.some(
            (row) => row.status === "DUE_SOON" || row.status === "WARNING",
          )
        ? "DUE_SOON"
        : requirementStatuses.some((row) => row.status === "COMPLIANT")
          ? "COMPLIANT"
          : "UNDEFINED";
    await tx.equipmentItem.update({
      where: { id: item.id },
      data: { complianceStatus },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE_REVIEW",
        entityType: "EquipmentItem",
        entityId: item.id,
        newValue: { name: parsed.data.name, needsReview: false },
      },
    });
  });
  revalidatePath(`/prostredky/${item.id}`);
  revalidatePath("/prostredky");
  redirect(`/prostredky/${item.id}`);
}
