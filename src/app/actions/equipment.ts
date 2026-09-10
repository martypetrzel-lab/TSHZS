"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createReadableId } from "@/lib/uid";

const schema = z.object({
  name: z.string().trim().min(2, "Název musí mít alespoň 2 znaky."),
  categoryId: z.string().min(1, "Vyberte kategorii."),
  locationId: z.string().optional(),
  manufacturer: z.string().trim().optional(),
  model: z.string().trim().optional(),
  serialNumber: z.string().trim().optional(),
  registrationNumber: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

export async function createEquipment(formData: FormData) {
  const user = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    redirect(
      `/prostredky/novy?chyba=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Neplatná data")}`,
    );
  const station = await prisma.station.findFirstOrThrow({
    where: {
      organizationId: (
        await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
      ).organizationId,
    },
  });
  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.equipmentItem.create({
      data: {
        ...parsed.data,
        locationId: parsed.data.locationId || null,
        uid: createReadableId("UID"),
        organizationId: station.organizationId,
        stationId: station.id,
        createdById: user.id,
        status: "IN_STOCK",
      },
    });
    await tx.equipmentStatusHistory.create({
      data: {
        equipmentId: created.id,
        toStatus: "IN_STOCK",
        reason: "Zavedení do evidence",
        changedById: user.id,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        entityType: "EquipmentItem",
        entityId: created.id,
        newValue: { uid: created.uid, name: created.name },
      },
    });
    return created;
  });
  revalidatePath("/prostredky");
  redirect(`/prostredky/${item.id}`);
}
