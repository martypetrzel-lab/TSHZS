import { addCalendarInterval } from "./rule-engine";

export const PRAGUE_TIME_ZONE = "Europe/Prague";

export function todayDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PRAGUE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function parseDateOnly(value: FormDataEntryValue | null, label: string) {
  const raw = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`${label} není platné.`);
  const parsed = new Date(`${raw}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw)
    throw new Error(`${label} není platné.`);
  return parsed;
}

export function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function nextDueFromPerformedAt(input: {
  performedAt: Date;
  intervalValue: number | null;
  intervalUnit: string | null;
  result: string;
  trigger: string;
}) {
  if (
    input.result === "FAILED" ||
    !input.intervalValue ||
    input.trigger !== "PERIODIC" ||
    !input.intervalUnit ||
    !["DAYS", "WEEKS", "MONTHS", "YEARS"].includes(input.intervalUnit)
  ) return null;
  return addCalendarInterval(
    input.performedAt,
    input.intervalValue,
    input.intervalUnit as "DAYS" | "WEEKS" | "MONTHS" | "YEARS",
  );
}

export function protocolCounterKey(protocolDate: Date) {
  return `TS-MST-${protocolDate.getUTCFullYear()}`;
}

export function canUseHistoricalDates(roleCodes: Iterable<string>) {
  const roles = new Set(roleCodes);
  return roles.has("TS_ADMIN") || (roles.has("ADMIN") && roles.has("TECHNICIAN"));
}

export function historyYear(value: { protocolDate: Date | null; createdAt: Date }) {
  return (value.protocolDate ?? value.createdAt).getUTCFullYear();
}

export function restoreRequirementFromValidInspections(
  inspections: { performedAt: Date | null; completedAt: Date | null; result: string | null; nextDueAt: string | null }[],
) {
  const latest = [...inspections].sort((a, b) =>
    (b.performedAt ?? b.completedAt ?? new Date(0)).getTime() -
    (a.performedAt ?? a.completedAt ?? new Date(0)).getTime(),
  )[0];
  return {
    lastCompletedAt: latest?.performedAt ?? latest?.completedAt ?? null,
    nextDueAt: latest?.nextDueAt ? new Date(latest.nextDueAt) : null,
    status: latest ? (latest.result === "FAILED" ? "OVERDUE_BLOCKED" : "COMPLIANT") : "UNDEFINED",
  } as const;
}
