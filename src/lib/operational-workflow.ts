export const protocolTypes = { HANDOVER: "Předávací protokol", OUT_OF_SERVICE: "Protokol mimo provoz", REPAIR_PROPOSAL: "Návrh na opravu" } as const;
export type OperationalType = keyof typeof protocolTypes;
export function operationalCounterKey(type: OperationalType, date: Date) {
  return `${{ HANDOVER: "PP", OUT_OF_SERVICE: "MP", REPAIR_PROPOSAL: "NO" }[type]}-MST-${date.getUTCFullYear()}`;
}
export const repairStates: Record<string, string> = { DETECTED: "Závada zjištěna", PROPOSAL_REQUIRED: "Čeká na návrh", PENDING_APPROVAL: "Čeká na schválení", CHANGES_REQUIRED: "Vráceno k doplnění", APPROVED: "Schváleno", ORDERED: "Objednáno", HANDED_OVER: "Předáno do servisu", IN_REPAIR: "V opravě", WAITING_PARTS: "Čeká na díly", REPAIR_COMPLETED: "Oprava dokončena", AWAITING_COLLECTION: "Čeká na převzetí", AWAITING_INSPECTION: "Čeká na kontrolu", CLOSED: "Uzavřeno", REJECTED: "Neschváleno", CANCELLED: "Zrušeno" };
const transitions: Record<string, string[]> = { DETECTED: ["PROPOSAL_REQUIRED"], PROPOSAL_REQUIRED: ["PENDING_APPROVAL"], PENDING_APPROVAL: ["APPROVED", "REJECTED", "CHANGES_REQUIRED"], CHANGES_REQUIRED: ["PENDING_APPROVAL"], REJECTED: ["PROPOSAL_REQUIRED"], APPROVED: ["ORDERED"], ORDERED: ["HANDED_OVER", "IN_REPAIR"], HANDED_OVER: ["IN_REPAIR"], IN_REPAIR: ["WAITING_PARTS", "REPAIR_COMPLETED"], WAITING_PARTS: ["IN_REPAIR"], REPAIR_COMPLETED: ["AWAITING_COLLECTION", "AWAITING_INSPECTION"], AWAITING_COLLECTION: ["AWAITING_INSPECTION"], AWAITING_INSPECTION: ["CLOSED"] };
export function assertRepairTransition(from: string, to: string) {
  if (!(transitions[from] ?? []).includes(to)) throw new Error("Tento přechod stavu opravy není povolen.");
}
export function assertFinancialApproval(input: { authorId: string; actorId: string; allowed: boolean; reason: string }) {
  if (!input.allowed) throw new Error("Chybí oprávnění schvalovat opravy.");
  if (input.authorId === input.actorId) throw new Error("Vlastní návrh nelze schválit.");
  if (!input.reason.trim()) throw new Error("Vyjádření schvalující osoby je povinné.");
}
export function assertReturnToService(input: { blockingDefects: number; blockingRequirements: number; activeHandovers: number; passedInspection: boolean; serviceReport: boolean }) {
  if (input.blockingDefects || input.blockingRequirements || input.activeHandovers || !input.passedInspection || !input.serviceReport) throw new Error("Podmínky návratu do provozu nejsou splněny. Ověřte závady, povinnosti, předání, kontrolu po opravě a servisní zprávu.");
}
