import { addDays, addMonths, addWeeks, addYears, isAfter, isBefore } from "date-fns";

export type ApplicableRule = {
  id: string;
  name: string;
  validFrom: Date;
  validTo?: Date | null;
  intervalValue?: number | null;
  intervalUnit?: "DAYS" | "WEEKS" | "MONTHS" | "YEARS" | "OPERATING_HOURS" | "USAGE_COUNT" | null;
  exactDate?: Date | null;
  trigger?: "PERIODIC" | "BEFORE_COMMISSIONING" | "BEFORE_USE" | "AFTER_USE" | "AFTER_UNUSUAL_USE" | "AFTER_REPAIR" | "AFTER_REVISION" | "SHIFT_HANDOVER" | "ON_DOUBT" | "ON_BROKEN_SEAL";
  sourceType?: string | null;
};

export function addCalendarInterval(date: Date, value: number, unit: NonNullable<ApplicableRule["intervalUnit"]>) {
  if (unit === "DAYS") return addDays(date, value);
  if (unit === "WEEKS") return addWeeks(date, value);
  if (unit === "MONTHS") return addMonths(date, value);
  if (unit === "YEARS") return addYears(date, value);
  throw new Error("Provozní interval nelze převést na kalendářní datum.");
}

export function evaluateRules(rules: ApplicableRule[], lastCompletedAt: Date, at = new Date()) {
  const applicable = rules
    .filter((rule) => !isAfter(rule.validFrom, at) && (!rule.validTo || !isBefore(rule.validTo, at)))
    .map((rule) => ({
      ...rule,
      dueAt: rule.exactDate ?? (rule.intervalValue && rule.intervalUnit && !["OPERATING_HOURS", "USAGE_COUNT"].includes(rule.intervalUnit) && (rule.trigger ?? "PERIODIC") === "PERIODIC"
        ? addCalendarInterval(lastCompletedAt, rule.intervalValue, rule.intervalUnit)
        : null),
    }));

  const dated = applicable.filter((rule): rule is typeof rule & { dueAt: Date } => rule.dueAt !== null);
  const decisive = dated.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0] ?? null;
  return { applicable, decisive, dueAt: decisive?.dueAt ?? null };
}

export function nextOperatingThreshold(current: number, interval: number) {
  if (interval <= 0) throw new Error("Interval musí být kladný.");
  return (Math.floor(current / interval) + 1) * interval;
}

export function findRuleConflicts(rules: ApplicableRule[]) {
  const groups = new Map<string, ApplicableRule[]>();
  for (const rule of rules) {
    const key = rule.name.trim().toLocaleLowerCase("cs");
    groups.set(key, [...(groups.get(key) ?? []), rule]);
  }
  return [...groups.values()].filter((group) => new Set(group.map((r) => `${r.intervalValue}:${r.intervalUnit}`)).size > 1);
}

export function legacyComparison(legacy: ApplicableRule[], methodology: ApplicableRule[]) {
  const conflicts = findRuleConflicts([...legacy, ...methodology]);
  return { status: conflicts.length ? "NESOULAD" as const : "SHODA" as const, conflicts };
}
