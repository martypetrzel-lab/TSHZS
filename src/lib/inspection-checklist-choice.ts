export function chooseInspectionChecklist(
  assignedChecklistVersionId?: string | null,
  fallbackChecklistVersionId?: string | null,
) {
  if (assignedChecklistVersionId) {
    return {
      checklistVersionId: assignedChecklistVersionId,
      fallback: false,
    };
  }

  if (fallbackChecklistVersionId) {
    return {
      checklistVersionId: fallbackChecklistVersionId,
      fallback: true,
    };
  }

  return null;
}
