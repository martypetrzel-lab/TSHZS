export type ChecklistAnswer = { required: boolean; allowNotApplicable?: boolean; value?: unknown; notApplicable?: boolean; reason?: string };

export function validateChecklistCompletion(answers: ChecklistAnswer[]) {
  const missing = answers.filter((answer) => answer.required && answer.value == null && !answer.notApplicable);
  const invalidNa = answers.filter((answer) => answer.notApplicable && (!answer.allowNotApplicable || !answer.reason?.trim()));
  return { valid: missing.length === 0 && invalidNa.length === 0, missing, invalidNa };
}

export function assertInspectionMutable(state: string) {
  if (state !== "DRAFT") throw new Error("Uzavřený protokol je neměnný. Vytvořte storno nebo opravný záznam.");
}

export function correctionRecord(originalId: string, reason: string) {
  if (!reason.trim()) throw new Error("Důvod opravy je povinný.");
  return { correctionOfId: originalId, correctionReason: reason.trim(), state: "CORRECTED" as const };
}

export function equipmentOutcome(result: "PASSED" | "FAILED" | "PASSED_WITH_LIMITATION", criticalParameterFailed = false) {
  const failed = result === "FAILED" || criticalParameterFailed;
  return { equipmentStatus: failed ? "OUT_OF_SERVICE" as const : "IN_SERVICE" as const, createDefect: failed, severity: failed ? "CRITICAL" as const : null };
}
