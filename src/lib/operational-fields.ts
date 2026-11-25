export const operationalLabels: Record<string, string> = {
  reason: "Důvod",
  description: "Popis závady / stavu",
  solution: "Navrhovaný postup / oprava",
  justification: "Odůvodnění opravy",
  sender: "Předávající",
  senderRole: "Zařazení předávajícího",
  senderOrganization: "Organizace předávajícího",
  senderContact: "Kontakt předávajícího",
  recipient: "Přebírající",
  recipientRole: "Zařazení přebírajícího",
  recipientOrganization: "Organizace příjemce",
  recipientAddress: "Adresa",
  recipientPhone: "Telefon",
  recipientEmail: "E-mail",
  place: "Místo předání",
  accessories: "Příslušenství",
  condition: "Stav",
  note: "Poznámka",
  expectedReturn: "Vrácení do",
  estimatedCost: "Předpokládaná cena",
  currency: "Měna",
  priceBasis: "Cena s DPH / bez DPH",
  quoteNumber: "Číslo nabídky",
  dueDate: "Termín opravy",
  priority: "Priorita",
  handoverPurpose: "Účel předání",
  foundDate: "Datum zjištění závady",
  foundBy: "Závadu zjistil",
  severity: "Závažnost",
  measures: "Skutečně přijatá opatření",
  responsibleUserId: "Odpovědná osoba",
  supplierId: "Servisní organizace",
  targetVehicleId: "Cílové vozidlo",
  targetLocationId: "Cílové umístění",
  relatedInspectionId: "Související kontrola",
  relatedDefectId: "Související závada",
  relatedProtocolId: "Související protokol",
  repairCaseId: "Servisní případ",
};
export const handoverPurposes: Record<string, string> = {
  SERVICE: "Předání do servisu",
  REPAIR: "Předání do opravy",
  REVISION: "Předání k revizi",
  CALIBRATION: "Předání ke kalibraci",
  LOAN: "Zápůjčka",
  VEHICLE: "Předání mezi vozidly",
  STATION: "Předání mezi stanicemi",
  PERSON: "Předání osobě",
  PERMANENT: "Trvalé předání",
  RETURN: "Vrácení prostředku",
  OTHER: "Jiné",
};
export function publicFieldValue(key: string, value: string) {
  return key === "handoverPurpose"
    ? (handoverPurposes[value] ?? value)
    : key === "severity"
      ? ((
          {
            MINOR: "Drobná",
            SIGNIFICANT: "Závažná",
            CRITICAL: "Kritická",
          } as Record<string, string>
        )[value] ?? value)
      : value;
}
export const attachmentKinds: Record<string, string> = {
  PHOTO: "Fotografie",
  QUOTE: "Cenová nabídka",
  ORDER: "Objednávka",
  SERVICE_REPORT: "Servisní zpráva",
  INVOICE: "Faktura",
  REVISION: "Revizní zpráva",
  SIGNED_HANDOVER: "Podepsaný protokol",
  OTHER: "Další dokumentace",
};
export const operationalActionLabels: Record<string, string> = {
  PROTOCOL_CREATED: "Vytvoření návrhu",
  PROTOCOL_DRAFT_UPDATED: "Úprava návrhu",
  PROTOCOL_ISSUED: "Vystavení dokumentu",
  PROTOCOL_CANCELLED: "Storno dokumentu",
  HANDOVER_CONFIRMED: "Potvrzení skutečného předání",
  HANDOVER_ACCEPTED: "Elektronické potvrzení převzetí",
  HANDOVER_DEADLINE_CHANGED: "Změna termínu vrácení",
  EQUIPMENT_OUT_OF_SERVICE: "Potvrzení odstavení",
  REPAIR_SUBMITTED: "Odeslání ke schválení",
  REPAIR_APPROVED: "Schválení opravy",
  REPAIR_REJECTED: "Neschválení opravy",
  REPAIR_RETURNED_FOR_CHANGES: "Vrácení k doplnění",
  ATTACHMENT_UPLOADED: "Nahrání přílohy",
};
