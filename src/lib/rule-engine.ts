import { addDays, addMonths, addWeeks, addYears, isAfter, isBefore } from "date-fns";

export type ApplicableRule = {
  id: string;
  name: string;
  validFrom: Date;
  validTo?: Date | null;
  intervalValue?: number | null;
  intervalUnit?: "DAYS" | "WEEKS" | "MONTHS" | "YEARS" | null;
  exactDate?: Date | null;
};

export function addCalendarInterval(date: Date, value: number, unit: NonNullable<ApplicableRule["intervalUnit"]>) {
  if (unit === "DAYS") return addDays(date, value);
  if (unit === "WEEKS") return addWeeks(date, value);
  if (unit === "MONTHS") return addMonths(date, value);
  return addYears(date, value);
}

export function evaluateRules(rules: ApplicableRule[], lastCompletedAt: Date, at = new Date()) {
  const applicable = rules
    .filter((rule) => !isAfter(rule.validFrom, at) && (!rule.validTo || !isBefore(rule.validTo, at)))
    .map((rule) => ({
      ...rule,
      dueAt: rule.exactDate ?? (rule.intervalValue && rule.intervalUnit
        ? addCalendarInterval(lastCompletedAt, rule.intervalValue, rule.intervalUnit)
        : null),
    }));

  const dated = applicable.filter((rule): rule is typeof rule & { dueAt: Date } => rule.dueAt !== null);
  const decisive = dated.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0] ?? null;
  return { applicable, decisive, dueAt: decisive?.dueAt ?? null };
}
