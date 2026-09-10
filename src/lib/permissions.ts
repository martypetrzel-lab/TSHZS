export const EQUIPMENT_EDITOR_ROLES = [
  "ADMIN",
  "TS_ADMIN",
  "TECHNICIAN",
] as const;
export function canEditEquipment(roleCodes: string[]) {
  return roleCodes.some((role) =>
    EQUIPMENT_EDITOR_ROLES.includes(
      role as (typeof EQUIPMENT_EDITOR_ROLES)[number],
    ),
  );
}
