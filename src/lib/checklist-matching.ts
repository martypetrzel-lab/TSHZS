import { isExternalInspection } from "../../prisma/checklist-mapping.mjs";
export { isExternalInspection } from "../../prisma/checklist-mapping.mjs";

export function selectUnambiguousRule<
  T extends {
    id: string;
    name?: string;
    rule?: { name: string };
    intervalValue: number | null;
    intervalUnit: string | null;
    performedBy: string | null;
  },
>(
  requirement: {
    name: string;
    intervalValue: number | null;
    intervalUnit: string | null;
  },
  candidates: T[],
) {
  const nameOf = (rule: T) => rule.name ?? rule.rule?.name ?? "";
  const eligible = candidates.filter(
    (rule) => !isExternalInspection(rule.performedBy),
  );
  const interval = eligible.filter(
    (rule) =>
      rule.intervalValue === requirement.intervalValue &&
      rule.intervalUnit === requirement.intervalUnit,
  );
  if (interval.length === 1) return interval[0];
  const normalized = requirement.name.toLocaleLowerCase("cs");
  const named = eligible.filter(
    (rule) =>
      normalized.includes(nameOf(rule).toLocaleLowerCase("cs")) ||
      nameOf(rule).toLocaleLowerCase("cs").includes(normalized),
  );
  if (named.length === 1) return named[0];
  return eligible.length === 1 ? eligible[0] : null;
}
