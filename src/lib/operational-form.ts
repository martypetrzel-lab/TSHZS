import type { OperationalType } from "./operational-workflow";
type Section = { title: string; fields: string[] };
export const operationalForms: Record<
  OperationalType,
  {
    description: string;
    sections: Section[];
    itemFields: string[];
    requiredFields: string[];
    labels: Record<string, string>;
  }
> = {
  HANDOVER: {
    description:
      "Samostatný doklad o předání a převzetí jednoho nebo více prostředků. Obsahuje předávajícího, příjemce, stav a termín vrácení.",
    sections: [
      {
        title: "Předání",
        fields: [
          "reason",
          "handoverPurpose",
          "eventPlannedAt",
          "eventOccurredAt",
          "place",
        ],
      },
      {
        title: "Předávající",
        fields: ["sender", "senderRole", "senderOrganization", "senderContact"],
      },
      {
        title: "Přebírající",
        fields: [
          "supplierId",
          "recipientUserId",
          "recipient",
          "recipientRole",
          "recipientOrganization",
          "recipientAddress",
          "recipientPhone",
          "recipientEmail",
        ],
      },
      {
        title: "Vrácení a umístění",
        fields: ["expectedReturn", "targetVehicleId", "targetLocationId"],
      },
      { title: "Doplňující údaje", fields: ["responsibleUserId", "note"] },
    ],
    itemFields: ["condition", "accessories", "note"],
    requiredFields: [
      "reason",
      "handoverPurpose",
      "place",
      "sender",
      "recipient",
    ],
    labels: {
      reason: "Důvod předání",
      eventPlannedAt: "Plánované datum předání",
      eventOccurredAt: "Datum skutečného předání",
    },
  },
  OUT_OF_SERVICE: {
    description:
      "Samostatný doklad o nezpůsobilosti jednoho prostředku. Zaznamenává závadu, její závažnost, přijatá opatření a skutečné odstavení.",
    sections: [
      {
        title: "Zjištěná závada a technický stav",
        fields: ["reason", "description", "foundDate", "foundBy", "severity"],
      },
      {
        title: "Odstavení a opatření",
        fields: ["eventPlannedAt", "eventOccurredAt", "measures", "solution"],
      },
      {
        title: "Zpracování protokolu",
        fields: [
          "sender",
          "senderRole",
          "senderContact",
          "responsibleUserId",
          "note",
        ],
      },
    ],
    itemFields: [],
    requiredFields: ["reason", "description"],
    labels: {
      reason: "Důvod odstavení",
      description: "Popis závady a technického stavu",
      solution: "Doporučený další postup",
      sender: "Zpracoval",
      senderRole: "Zařazení zpracovatele",
      senderContact: "Kontakt zpracovatele",
      eventPlannedAt: "Plánované datum odstavení",
      eventOccurredAt: "Datum skutečného odstavení",
    },
  },
  REPAIR_PROPOSAL: {
    description:
      "Samostatný návrh opravy jednoho prostředku s odůvodněním a odhadem nákladů. Návrh není objednávkou ani schválením opravy.",
    sections: [
      {
        title: "Navrhovaná oprava",
        fields: [
          "reason",
          "description",
          "solution",
          "justification",
          "priority",
          "dueDate",
        ],
      },
      {
        title: "Servis a předpokládané náklady",
        fields: [
          "supplierId",
          "estimatedCost",
          "currency",
          "priceBasis",
          "quoteNumber",
        ],
      },
      {
        title: "Navrhovatel",
        fields: [
          "sender",
          "senderRole",
          "senderContact",
          "responsibleUserId",
          "note",
        ],
      },
    ],
    itemFields: [],
    requiredFields: ["reason", "description", "solution", "justification"],
    labels: {
      reason: "Důvod návrhu opravy",
      description: "Popis závady",
      solution: "Rozsah navrhované opravy",
      sender: "Navrhovatel",
      senderRole: "Zařazení navrhovatele",
      senderContact: "Kontakt navrhovatele",
      dueDate: "Požadovaný termín opravy",
    },
  },
};
export function operationalFormFields(type: OperationalType) {
  return operationalForms[type].sections.flatMap((section) => section.fields);
}
