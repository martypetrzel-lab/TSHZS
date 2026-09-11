"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEquipmentEditor } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

export async function applyCeproMethodology(formData: FormData) {
  const user = await requireEquipmentEditor();
  const equipmentId = String(formData.get("equipmentId") ?? "");
  const targetKey = String(formData.get("targetKey") ?? "");
  const mode = String(formData.get("mode") ?? "add");
  if (!equipmentId || !targetKey || formData.get("previewConfirmed") !== "yes") redirect("/pravidla/cepro/porovnani?chyba=Nejprve+potvrďte+náhled");
  await prisma.$transaction(async (tx) => {
    const rules = await tx.rule.findMany({ where: { sourceType: "INTERNAL_CEPRO", targetKey, active: true }, include: { versions: { where: { validTo: null }, orderBy: { version: "desc" }, take: 1 } } });
    if (mode === "replace") await tx.equipmentRequirement.updateMany({ where: { equipmentId, sourceType: "LEGACY_IMPORT", archivedAt: null }, data: { archivedAt: new Date(), resolutionReason: "Ručně nahrazeno metodikou ČEPRO" } });
    for (const rule of rules) {
      const version = rule.versions[0];
      if (!version) continue;
      const exists = await tx.equipmentRequirement.findFirst({ where: { equipmentId, sourceRuleId: rule.id, archivedAt: null } });
      if (!exists) await tx.equipmentRequirement.create({ data: { equipmentId, ruleVersionId: version.id, sourceRuleId: rule.id, sourceType: "INTERNAL_CEPRO", source: "Metodika HZS ČEPRO V6R1", type: rule.requirementType, name: rule.name, intervalValue: version.intervalValue, intervalUnit: version.intervalUnit, trigger: version.trigger, performedBy: version.performedBy, status: "UNDEFINED", needsReview: true, note: "Termín nebyl automaticky odvozen; doplňte poslední provedení nebo příští termín." } });
    }
    await tx.auditLog.create({ data: { userId: user.id, action: mode === "replace" ? "CEPRO_REPLACE_LEGACY" : "CEPRO_ADD_REQUIREMENTS", entityType: "EquipmentItem", entityId: equipmentId, newValue: { targetKey, mode }, reason: String(formData.get("reason") ?? "Ručně potvrzené porovnání s metodikou ČEPRO") } });
  });
  revalidatePath(`/prostredky/${equipmentId}`);
  revalidatePath("/pravidla/cepro/porovnani");
  redirect(`/prostredky/${equipmentId}?metodika=1`);
}
