import { PrismaClient, RuleSourceType } from "@prisma/client";
import { seedInitialAdmin } from "./initial-admin.mjs";
import {
  CEPRO_CHECKLISTS,
  CEPRO_DETAILED_CHECKLISTS,
  CEPRO_RULES,
  CEPRO_SOURCE,
} from "./cepro-methodology.mjs";
import {
  checklistKeyForRule,
  ruleVersionStrategy,
} from "./checklist-mapping.mjs";

const db = new PrismaClient();

const categories = [
  [
    "A",
    "Pro hašení a čerpání",
    ["Hasicí", "Přívodního vedení", "Výtlačného vedení", "Pěnotvorné"],
  ],
  [
    "B",
    "Pro technické činnosti",
    [
      "Pneumatické vyprošťovací a těsnicí",
      "Osvětlovací a varovné",
      "Vyprošťovací a destrukční",
      "Evakuační",
      "První pomoci",
      "Přenosné žebříky",
      "Ostatní účelové",
    ],
  ],
  [
    "C",
    "Pro práci ve výšce a nad volnou hloubkou",
    [
      "Lana",
      "Pásy a postroje",
      "Ostatní textilní materiál",
      "Karabiny a spojky",
      "Ostatní kovový materiál",
      "Prostředky pro vytahování a spouštění",
      "Ochranné",
      "Ostatní",
    ],
  ],
  [
    "D",
    "Pro práci na vodní hladině",
    [
      "Záchranná plavidla",
      "Vybavení plavidel",
      "Záchranné",
      "Ochranné",
      "K vyhledávání",
      "Norné stěny",
      "Protipovodňové",
    ],
  ],
  ["E", "Ochranné pro hasiče", ["Ve výhradním užívání", "Společné"]],
];

async function adoptSeededRecord(model, seedKey, legacyWhere, create) {
  const seeded = await model.findUnique({ where: { seedKey } });
  if (seeded) return seeded;
  const legacy = await model.findFirst({ where: legacyWhere });
  try {
    if (legacy)
      return await model.update({
        where: { id: legacy.id },
        data: { seedKey },
      });
    return await model.create({ data: { ...create, seedKey } });
  } catch (error) {
    if (error?.code === "P2002")
      return model.findUniqueOrThrow({ where: { seedKey } });
    throw error;
  }
}

async function seedMasterData() {
  const organization = await db.organization.upsert({
    where: { name: "HZS ČEPRO" },
    update: {},
    create: { name: "HZS ČEPRO" },
  });
  const station = await db.station.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: "Mstětice",
      },
    },
    update: {},
    create: { name: "Mstětice", organizationId: organization.id },
  });

  const root = await adoptSeededRecord(
    db.location,
    "mstetice:station",
    { stationId: station.id, parentId: null, name: "Stanice" },
    { stationId: station.id, name: "Stanice" },
  );
  for (const [slug, name] of [
    ["ts-store", "Sklad TS"],
    ["workshop", "Dílna"],
    ["store", "Sklad"],
    ["garage", "Garáž"],
  ]) {
    await adoptSeededRecord(
      db.location,
      `mstetice:${slug}`,
      { stationId: station.id, parentId: root.id, name },
      { stationId: station.id, parentId: root.id, name },
    );
  }

  const categoryIds = new Map();
  for (const [code, name, children] of categories) {
    const parent = await db.equipmentCategory.upsert({
      where: { code },
      update: { name },
      create: { code, name },
    });
    categoryIds.set(name, parent.id);
    for (const [index, child] of children.entries()) {
      const childCode = `${code}.${index + 1}`;
      const row = await db.equipmentCategory.upsert({
        where: { code: childCode },
        update: { name: child, parentId: parent.id },
        create: { code: childCode, name: child, parentId: parent.id },
      });
      categoryIds.set(child, row.id);
    }
  }

  const source = await adoptSeededRecord(
    db.sourceDocument,
    "order:62-2016",
    { documentNumber: "62/2016" },
    {
      title: "Pokyn generálního ředitele HZS ČR – Řád technické služby HZS ČR",
      documentNumber: "62/2016",
      sourceType: RuleSourceType.TECHNICAL_SERVICE_ORDER,
    },
  );

  for (const [name, months] of [
    ["První pomoci", 6],
    ["Pro práci ve výšce a nad volnou hloubkou", 12],
    ["Pneumatické vyprošťovací a těsnicí", 12],
  ]) {
    const categoryId = categoryIds.get(name);
    if (!categoryId) continue;
    const ruleName = `Pravidelná kontrola – ${name}`;
    const rule = await adoptSeededRecord(
      db.rule,
      `order:62-2016:${name}`,
      { name: ruleName, sourceDocumentId: source.id },
      {
        name: ruleName,
        requirementType: "INSPECTION",
        sourceType: "TECHNICAL_SERVICE_ORDER",
        sourceDocumentId: source.id,
        categoryId,
      },
    );
    await db.rule.update({
      where: { id: rule.id },
      data: { name: ruleName, categoryId, sourceDocumentId: source.id },
    });
    await db.ruleVersion.upsert({
      where: { ruleId_version: { ruleId: rule.id, version: 1 } },
      update: {},
      create: {
        ruleId: rule.id,
        version: 1,
        validFrom: new Date("2016-12-01T00:00:00Z"),
        intervalValue: months,
        intervalUnit: "MONTHS",
        note: "Platí, pokud výrobce nestanovil kratší interval.",
      },
    });
  }

  const template = await adoptSeededRecord(
    db.checklistTemplate,
    "checklist:general",
    { name: "Obecná kontrola prostředku" },
    { name: "Obecná kontrola prostředku" },
  );
  await db.checklistTemplateVersion.upsert({
    where: { templateId_version: { templateId: template.id, version: 1 } },
    update: {},
    create: {
      templateId: template.id,
      version: 1,
      sections: {
        create: [
          {
            title: "Vizuální kontrola",
            sortOrder: 1,
            items: {
              create: [
                "Celistvost",
                "Úplnost",
                "Známky poškození",
                "Čitelnost označení",
                "Kompletnost příslušenství",
              ].map((label, sortOrder) => ({
                label,
                responseType: "PASS_FAIL_NA",
                required: true,
                failRequiresNote: true,
                failCreatesDefect: true,
                sortOrder,
              })),
            },
          },
          {
            title: "Funkční kontrola",
            sortOrder: 2,
            items: {
              create: ["Správný chod", "Ovládání", "Funkčnost"].map(
                (label, sortOrder) => ({
                  label,
                  responseType: "PASS_FAIL_NA",
                  required: true,
                  failRequiresNote: true,
                  failCreatesDefect: true,
                  sortOrder,
                }),
              ),
            },
          },
        ],
      },
    },
  });

  await seedCeproMethodology();

  for (const [code, name] of [
    ["ADMIN", "Administrátor"],
    ["TS_ADMIN", "Vedoucí technické služby"],
    ["TECHNICIAN", "Technik"],
    ["USER", "Uživatel"],
  ]) {
    await db.role.upsert({
      where: { code },
      update: { name },
      create: { code, name },
    });
  }
  return organization;
}

async function seedCeproMethodology() {
  const source = await adoptSeededRecord(
    db.sourceDocument,
    CEPRO_SOURCE.seedKey,
    {
      documentNumber: CEPRO_SOURCE.documentNumber,
      version: CEPRO_SOURCE.version,
    },
    { ...CEPRO_SOURCE, sourceType: RuleSourceType.INTERNAL_CEPRO },
  );
  await db.sourceDocument.update({
    where: { id: source.id },
    data: {
      title: CEPRO_SOURCE.title,
      documentNumber: CEPRO_SOURCE.documentNumber,
      version: CEPRO_SOURCE.version,
      issuer: CEPRO_SOURCE.issuer,
      effectiveFrom: CEPRO_SOURCE.effectiveFrom,
      sourceType: RuleSourceType.INTERNAL_CEPRO,
    },
  });

  const checklistVersions = new Map();
  const checklistEntries = [...CEPRO_CHECKLISTS];
  for (const [key, name] of [
    ["thermal-daily", "Termokamera – denní"],
    ["thermal-weekly", "Termokamera – týdenní"],
    ["thermal-monthly", "Termokamera – měsíční"],
    ["general-ts", "Obecný checklist dle metodiky – doplnit podle výrobce"],
  ])
    if (!checklistEntries.some(([existing]) => existing === key))
      checklistEntries.push([key, name, []]);
  for (const [key, name, items] of checklistEntries) {
    const template = await adoptSeededRecord(
      db.checklistTemplate,
      `cepro:${key}`,
      { name },
      { name },
    );
    const detailed = CEPRO_DETAILED_CHECKLISTS[key];
    const versionNumber = key === "general-ts" ? 3 : detailed ? 2 : 1;
    const version = await db.checklistTemplateVersion.upsert({
      where: {
        templateId_version: { templateId: template.id, version: versionNumber },
      },
      update: {},
      create: {
        templateId: template.id,
        version: versionNumber,
        validFrom: CEPRO_SOURCE.effectiveFrom,
        allowPassedWithLimitation: key === "general-ts",
        nonCriticalFailureResult:
          key === "general-ts" ? "PASSED_WITH_LIMITATION" : "FAILED",
        sections: {
          create: (
            detailed ?? [
              {
                title: "Pracovní parametry metodiky",
                items: items.map((label) => ({
                  label,
                  responseType:
                    label.includes("MPa") || label.includes("minut")
                      ? "MEASUREMENT"
                      : "PASS_FAIL",
                  required: true,
                  failRequiresNote: true,
                  failCreatesDefect: true,
                })),
              },
            ]
          ).map((section, sectionIndex) => ({
            title: section.title,
            sortOrder: sectionIndex + 1,
            items: {
              create: section.items.map((item, sortOrder) => ({
                label: item.label,
                responseType: item.responseType,
                required: item.required ?? true,
                allowNotApplicable: item.allowNotApplicable ?? false,
                naRequiresReason: item.naRequiresReason ?? false,
                failRequiresNote: item.failRequiresNote ?? false,
                failRequiresPhoto: item.failRequiresPhoto ?? false,
                failCreatesDefect: item.failCreatesDefect ?? false,
                critical: item.critical ?? false,
                unit: item.unit,
                optionsJson: item.optionsJson,
                conditionJson: section.conditionJson,
                sortOrder,
              })),
            },
          })),
        },
      },
    });
    checklistVersions.set(key, version.id);
  }

  const desiredVersions = [];
  for (const entry of CEPRO_RULES) {
    const seedKey =
      `cepro:${entry.targetKey}:${entry.name}:${entry.trigger}:${entry.intervalValue ?? "event"}:${entry.intervalUnit ?? "none"}:${entry.performedBy}`
        .toLowerCase()
        .replaceAll(" ", "-");
    const found = await adoptSeededRecord(
      db.rule,
      seedKey,
      {
        name: entry.name,
        sourceDocumentId: source.id,
        targetKey: entry.targetKey,
      },
      {
        name: entry.name,
        requirementType: entry.type,
        sourceType: RuleSourceType.INTERNAL_CEPRO,
        sourceDocumentId: source.id,
        targetKey: entry.targetKey,
        targetLabel: entry.targetLabel,
      },
    );
    await db.rule.update({
      where: { id: found.id },
      data: {
        name: entry.name,
        requirementType: entry.type,
        sourceType: RuleSourceType.INTERNAL_CEPRO,
        sourceDocumentId: source.id,
        targetKey: entry.targetKey,
        targetLabel: entry.targetLabel,
        active: true,
      },
    });
    const checklistKey = checklistKeyForRule(entry);
    const desiredChecklistId = checklistKey
      ? checklistVersions.get(checklistKey)
      : null;
    const baseVersion = await db.ruleVersion.upsert({
      where: { ruleId_version: { ruleId: found.id, version: 1 } },
      update: {},
      create: {
        ruleId: found.id,
        version: 1,
        validFrom: CEPRO_SOURCE.effectiveFrom,
        intervalValue: entry.intervalValue,
        intervalUnit: entry.intervalUnit,
        trigger: entry.trigger,
        performedBy: entry.performedBy,
        article: entry.article ?? null,
        note:
          entry.note ??
          "Požadavky výrobce stanovené odlišně nebo nad rámec metodiky zůstávají současně platné.",
        checklistTemplateVersionId: desiredChecklistId,
      },
    });
    desiredVersions.push({
      rule: found,
      baseVersion,
      entry,
      desiredChecklistId,
    });
  }
  await reconcileChecklistLinks(desiredVersions);
}

async function reconcileChecklistLinks(desiredVersions) {
  for (const {
    rule,
    baseVersion,
    entry,
    desiredChecklistId,
  } of desiredVersions) {
    if (!desiredChecklistId) continue;
    let targetVersion = baseVersion;
    const latestDesired = await db.ruleVersion.findFirst({
      where: {
        ruleId: rule.id,
        checklistTemplateVersionId: desiredChecklistId,
        validTo: null,
      },
      orderBy: { version: "desc" },
    });
    if (latestDesired) targetVersion = latestDesired;
    if (baseVersion.checklistTemplateVersionId !== desiredChecklistId) {
      const used = await db.ruleVersion.findFirst({
        where: {
          id: baseVersion.id,
          OR: [
            { protocolRules: { some: {} } },
            {
              requirements: {
                some: {
                  inspections: {
                    some: {
                      state: { in: ["CLOSED", "CANCELLED", "CORRECTED"] },
                    },
                  },
                },
              },
            },
          ],
        },
        select: { id: true },
      });
      const strategy = ruleVersionStrategy({
        currentChecklistId: baseVersion.checklistTemplateVersionId,
        desiredChecklistId,
        historicallyUsed: Boolean(used),
        safeVersionExists: Boolean(latestDesired),
      });
      if (strategy === "REUSE_VERSION") targetVersion = latestDesired;
      else if (strategy === "CREATE_VERSION") {
        const latest = await db.ruleVersion.findFirst({
          where: { ruleId: rule.id },
          orderBy: { version: "desc" },
          select: { version: true },
        });
        targetVersion = await db.ruleVersion.create({
          data: {
            ruleId: rule.id,
            version: (latest?.version ?? 0) + 1,
            validFrom: new Date(),
            intervalValue: entry.intervalValue,
            intervalUnit: entry.intervalUnit,
            trigger: entry.trigger,
            performedBy: entry.performedBy,
            article: entry.article ?? null,
            note:
              entry.note ??
              "Nová verze vytvořená bezpečným doplněním checklistu; historická verze zůstala beze změny.",
            checklistTemplateVersionId: desiredChecklistId,
          },
        });
      } else if (strategy === "UPDATE_UNUSED") {
        targetVersion = await db.ruleVersion.update({
          where: { id: baseVersion.id },
          data: { checklistTemplateVersionId: desiredChecklistId },
        });
      }
    }
    const requirements = await db.equipmentRequirement.findMany({
      where: {
        sourceType: "INTERNAL_CEPRO",
        archivedAt: null,
        OR: [{ sourceRuleId: rule.id }, { ruleVersion: { ruleId: rule.id } }],
      },
      select: {
        id: true,
        ruleVersionId: true,
        equipmentId: true,
        ruleVersion: { select: { checklistTemplateVersionId: true } },
      },
    });
    for (const requirement of requirements) {
      if (
        requirement.ruleVersion?.checklistTemplateVersionId ===
        desiredChecklistId
      )
        continue;
      await db.$transaction([
        db.equipmentRequirement.update({
          where: { id: requirement.id },
          data: { ruleVersionId: targetVersion.id },
        }),
        db.auditLog.create({
          data: {
            action: "CHECKLIST_REQUIREMENT_RECONCILED",
            entityType: "EquipmentRequirement",
            entityId: requirement.id,
            previousValue: { ruleVersionId: requirement.ruleVersionId },
            newValue: {
              ruleVersionId: targetVersion.id,
              checklistTemplateVersionId: desiredChecklistId,
              equipmentId: requirement.equipmentId,
            },
            reason: "Idempotentní reconciliation pravidla HZS ČEPRO",
          },
        }),
      ]);
    }
  }
}

async function main() {
  console.info("=== TSHZS SEED START ===");
  const organization = await seedMasterData();
  await seedInitialAdmin(db, organization.id);
  console.info("=== TSHZS SEED DONE ===");
}

main()
  .catch((error) => {
    console.error("Inicializace databáze selhala.", error);
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());
