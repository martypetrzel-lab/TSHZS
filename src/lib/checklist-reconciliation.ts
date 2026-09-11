import "server-only";
import { prisma } from "@/lib/prisma";
import { suggestCeproTarget } from "@/lib/cepro";
import { selectUnambiguousRule } from "@/lib/checklist-matching";

export async function checklistMappingRows() {
  const requirements = await prisma.equipmentRequirement.findMany({
    where: { archivedAt: null, type: "INSPECTION" },
    include: {
      equipment: true,
      ruleVersion: { include: { rule: true } },
      sourceRule: true,
    },
    orderBy: [{ equipment: { name: "asc" } }, { name: "asc" }],
  });
  const targets = [
    ...new Set(
      requirements
        .map((r) => suggestCeproTarget(r.equipment.name, r.equipment.typeName))
        .filter(Boolean),
    ),
  ] as string[];
  const candidates = await prisma.ruleVersion.findMany({
    where: {
      rule: {
        sourceType: "INTERNAL_CEPRO",
        targetKey: { in: targets },
        requirementType: "INSPECTION",
        active: true,
      },
      checklistTemplateVersionId: { not: null },
      validTo: null,
    },
    include: { rule: true },
    orderBy: { version: "desc" },
  });
  const checklistIds = [
    ...new Set(
      [
        ...requirements.map((r) => r.ruleVersion?.checklistTemplateVersionId),
        ...candidates.map((r) => r.checklistTemplateVersionId),
      ].filter(Boolean),
    ),
  ] as string[];
  const checklistVersions = await prisma.checklistTemplateVersion.findMany({
    where: { id: { in: checklistIds } },
    include: { template: true },
  });
  const checklistById = new Map(
    checklistVersions.map((version) => [version.id, version]),
  );
  return requirements.map((requirement) => {
    const target = suggestCeproTarget(
      requirement.equipment.name,
      requirement.equipment.typeName,
    );
    const matches = candidates.filter(
      (candidate) => candidate.rule.targetKey === target,
    );
    const suggestion = selectUnambiguousRule(requirement, matches);
    const checklist = requirement.ruleVersion?.checklistTemplateVersionId
      ? checklistById.get(requirement.ruleVersion.checklistTemplateVersionId)
      : null;
    const conflict = Boolean(
      checklist &&
      suggestion &&
      checklist.id !== suggestion.checklistTemplateVersionId &&
      requirement.sourceType === "INTERNAL_CEPRO",
    );
    return {
      requirement,
      checklist,
      suggestion,
      candidates: matches,
      status: conflict
        ? "KONFLIKT"
        : requirement.sourceType === "LEGACY_IMPORT"
          ? "LEGACY"
          : checklist
            ? "PŘIŘAZENO"
            : "CHYBÍ CHECKLIST",
    } as const;
  });
}
