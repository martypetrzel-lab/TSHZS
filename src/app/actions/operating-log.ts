"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireEquipmentEditor } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
const schema = z.object({
  equipmentId: z.string().min(1),
  operatingHours: z.coerce.number().nonnegative(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().optional(),
});
export async function recordOperatingHours(formData: FormData) {
  const user = await requireEquipmentEditor();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    redirect(
      `/prostredky/${String(formData.get("equipmentId"))}?chyba=Neplatný+odečet`,
    );
  const item = await prisma.equipmentItem.findUniqueOrThrow({
    where: { id: parsed.data.equipmentId },
    select: { currentOperatingHours: true },
  });
  const previous = Number(item.currentOperatingHours ?? 0);
  if (parsed.data.operatingHours < previous)
    redirect(
      `/prostredky/${parsed.data.equipmentId}?chyba=Odečet+nesmí+být+nižší+než+předchozí`,
    );
  const date = new Date(`${parsed.data.date}T12:00:00.000Z`),
    delta = parsed.data.operatingHours - previous;
  await prisma.$transaction(async (tx) => {
    await tx.equipmentMeterReading.create({
      data: {
        equipmentId: parsed.data.equipmentId,
        operatingHours: parsed.data.operatingHours,
        readAt: date,
        recordedById: user.id,
        note: parsed.data.note || null,
      },
    });
    await tx.equipmentOperatingLog.create({
      data: {
        equipmentId: parsed.data.equipmentId,
        date,
        operatingHours: parsed.data.operatingHours,
        hoursDelta: delta,
        userId: user.id,
        note: parsed.data.note || null,
      },
    });
    await tx.equipmentItem.update({
      where: { id: parsed.data.equipmentId },
      data: {
        currentOperatingHours: parsed.data.operatingHours,
        operatingHoursReadAt: date,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "OPERATING_HOURS_RECORDED",
        entityType: "EquipmentItem",
        entityId: parsed.data.equipmentId,
        previousValue: { operatingHours: previous },
        newValue: {
          operatingHours: parsed.data.operatingHours,
          hoursDelta: delta,
        },
        reason: parsed.data.note || "Odečet motohodin",
      },
    });
  });
  revalidatePath(`/prostredky/${parsed.data.equipmentId}`);
  redirect(`/prostredky/${parsed.data.equipmentId}?odecet=1`);
}
