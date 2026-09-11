import "server-only";
import { prisma } from "@/lib/prisma";
import { chooseInspectionChecklist } from "@/lib/inspection-checklist-choice";

export async function resolveInspectionChecklist(
  checklistVersionId?: string | null,
) {
  const assigned = chooseInspectionChecklist(checklistVersionId, null);
  if (assigned) return assigned;

  const fallback = await prisma.checklistTemplateVersion.findFirst({
    where: {
      template: { seedKey: "cepro:general-ts", active: true },
      validTo: null,
    },
    orderBy: { version: "desc" },
  });
  const choice = chooseInspectionChecklist(checklistVersionId, fallback?.id);
  if (!choice)
    throw new Error(
      "Základní kontrolní formulář není v systému připraven. Kontaktujte správce.",
    );
  return choice;
}
