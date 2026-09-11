export const MANAGED_ROLE_CODES = [
  "ADMIN",
  "TS_ADMIN",
  "TECHNICIAN",
  "USER",
] as const;

export function wouldRemoveLastActiveAdmin(input: {
  targetIsActiveAdmin: boolean;
  nextActive: boolean;
  nextRoleCodes: string[];
  otherActiveAdminCount: number;
}) {
  return (
    input.targetIsActiveAdmin &&
    (!input.nextActive || !input.nextRoleCodes.includes("ADMIN")) &&
    input.otherActiveAdminCount === 0
  );
}
