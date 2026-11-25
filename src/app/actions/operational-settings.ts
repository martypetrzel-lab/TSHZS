"use server";
import { revalidatePath } from "next/cache";
import { requireSystemAdministrator } from "@/lib/authorization";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function saveOperationalSettings(form: FormData) {
  const user = await requireSystemAdministrator();
  const days = [
    ...new Set(
      String(form.get("reminderDays") ?? "")
        .split(",")
        .map((s) => Number(s.trim())),
    ),
  ];
  if (
    !days.length ||
    days.some((n) => !Number.isInteger(n) || n < 0 || n > 365)
  )
    throw new Error("Intervaly musí být celá čísla od 0 do 365.");
  await prisma.$transaction(async (tx) => {
    for (const [key, value] of [
      ["operational.reminderDays", days],
      ["operational.stampEnabled", form.get("stampEnabled") === "on"],
    ] as const)
      await tx.systemSetting.upsert({
        where: { key },
        create: { key, value, updatedById: user.id },
        update: { value, updatedById: user.id },
      });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "OPERATIONAL_SETTINGS_UPDATED",
        entityType: "Organization",
        entityId: user.organizationId,
        newValue: {
          reminderDays: days,
          stampEnabled: form.get("stampEnabled") === "on",
        },
      },
    });
  });
  revalidatePath("/administrace/provozni-nastaveni");
}
export async function readNotification(form: FormData) {
  const user = await requireUser();
  await prisma.operationalNotification.updateMany({
    where: { id: String(form.get("id") ?? ""), userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/upozorneni");
}
