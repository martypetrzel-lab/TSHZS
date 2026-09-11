import { isExternalInspection } from "../../prisma/checklist-mapping.mjs";

type InspectionUser = {
  roles: { role: { code: string } }[];
  qualifications?: {
    validUntil: Date | null;
    qualification: { id: string };
  }[];
};

type InspectionRequirement = {
  performedBy: string | null;
  sourceType?: string | null;
  ruleVersion?: {
    performedBy?: string | null;
    qualificationId?: string | null;
  } | null;
};

export function inspectionPerformedBy(requirement: InspectionRequirement) {
  return (
    requirement.performedBy ?? requirement.ruleVersion?.performedBy ?? null
  );
}

export function canUserPerformInspection(
  user: InspectionUser,
  requirement: InspectionRequirement,
  now = new Date(),
) {
  const performedBy = inspectionPerformedBy(requirement);
  if (isExternalInspection(performedBy)) return false;

  const roles = new Set(user.roles.map(({ role }) => role.code));
  const isTechnician = roles.has("TECHNICIAN") || roles.has("TS_ADMIN");
  const normalized = performedBy?.toLocaleLowerCase("cs") ?? "";

  if (!performedBy) {
    if (!isTechnician) return false;
  } else if (normalized.includes("uživatel")) {
    if (!(roles.has("USER") || isTechnician)) return false;
  } else if (!isTechnician) {
    return false;
  }

  const qualificationId = requirement.ruleVersion?.qualificationId;
  if (!qualificationId) return true;
  return Boolean(
    user.qualifications?.some(
      (entry) =>
        entry.qualification.id === qualificationId &&
        (!entry.validUntil || entry.validUntil >= now),
    ),
  );
}
