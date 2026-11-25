export function operationalProtocolProgress(
  type: string,
  status: string,
  actions: string[],
) {
  if (status === "DRAFT") return "Rozpracováno – nejprve vystavit protokol";
  if (type === "OUT_OF_SERVICE")
    return actions.includes("EQUIPMENT_OUT_OF_SERVICE")
      ? "Skutečné odstavení potvrzeno"
      : "Čeká na potvrzení skutečného odstavení";
  return actions.includes("REPAIR_SUBMITTED")
    ? "Návrh odeslán – pokračuje v servisním případu"
    : "Čeká na odeslání návrhu ke schválení";
}
