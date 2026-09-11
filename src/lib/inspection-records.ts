export type ChecklistAnswer = {
  id?: string;
  label?: string;
  responseType?: string;
  required: boolean;
  allowNotApplicable?: boolean;
  naRequiresReason?: boolean;
  failRequiresNote?: boolean;
  failRequiresPhoto?: boolean;
  failCreatesDefect?: boolean;
  critical?: boolean;
  value?: unknown;
  notApplicable?: boolean;
  reason?: string;
  photoCount?: number;
  failureValue?: unknown;
  failed?: boolean;
};

const empty = (value: unknown) =>
  value == null || (typeof value === "string" && !value.trim());
export const isFailedAnswer = (answer: ChecklistAnswer) =>
  answer.failed === true ||
  answer.value === "NEVYHOVUJE" ||
  (answer.failureValue !== undefined
    ? answer.value === answer.failureValue
    : answer.value === false);

export function validateChecklistCompletion(answers: ChecklistAnswer[]) {
  const missing = answers.filter(
    (a) =>
      a.required &&
      empty(a.value) &&
      !a.notApplicable &&
      !(a.responseType === "PHOTO" && a.photoCount),
  );
  const invalidNa = answers.filter(
    (a) =>
      a.notApplicable &&
      (!a.allowNotApplicable || (a.naRequiresReason && !a.reason?.trim())),
  );
  const missingFailNote = answers.filter(
    (a) => isFailedAnswer(a) && a.failRequiresNote && !a.reason?.trim(),
  );
  const missingFailPhoto = answers.filter(
    (a) => isFailedAnswer(a) && a.failRequiresPhoto && !a.photoCount,
  );
  return {
    valid:
      !missing.length &&
      !invalidNa.length &&
      !missingFailNote.length &&
      !missingFailPhoto.length,
    missing,
    invalidNa,
    missingFailNote,
    missingFailPhoto,
  };
}

export function calculateInspectionResult(
  answers: ChecklistAnswer[],
  config: {
    allowPassedWithLimitation: boolean;
    nonCriticalFailureResult: "FAILED" | "PASSED_WITH_LIMITATION" | "PASSED";
  },
) {
  const failures = answers.filter(isFailedAnswer);
  if (failures.some((a) => a.critical)) return "FAILED" as const;
  if (!failures.length) return "PASSED" as const;
  if (
    config.allowPassedWithLimitation &&
    config.nonCriticalFailureResult === "PASSED_WITH_LIMITATION"
  )
    return "PASSED_WITH_LIMITATION" as const;
  return "FAILED" as const;
}

export function assertInspectionMutable(state: string) {
  if (state !== "DRAFT")
    throw new Error(
      "Uzavřený protokol je neměnný. Vytvořte storno nebo opravný záznam.",
    );
}

export function correctionRecord(originalId: string, reason: string) {
  if (!reason.trim()) throw new Error("Důvod opravy je povinný.");
  return {
    correctionOfId: originalId,
    correctionReason: reason.trim(),
    state: "CORRECTED" as const,
  };
}

export function equipmentOutcome(
  result: "PASSED" | "FAILED" | "PASSED_WITH_LIMITATION",
) {
  const failed = result === "FAILED";
  return {
    equipmentStatus: failed
      ? ("OUT_OF_SERVICE" as const)
      : ("IN_SERVICE" as const),
    createDefect: failed,
    severity: failed ? ("CRITICAL" as const) : null,
  };
}

export function completionProgress(answers: ChecklistAnswer[]) {
  const required = answers.filter((a) => a.required);
  const completed = required.filter(
    (a) => !empty(a.value) || a.notApplicable,
  ).length;
  return {
    completed,
    total: required.length,
    percent: required.length
      ? Math.round((completed / required.length) * 100)
      : 100,
  };
}
