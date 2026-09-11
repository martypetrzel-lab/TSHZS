import { hash } from "bcryptjs";
import { PrismaClient, RuleSourceType } from "@prisma/client";
import {
  CEPRO_CHECKLISTS,
  CEPRO_DETAILED_CHECKLISTS,
  CEPRO_RULES,
  CEPRO_SOURCE,
} from "./cepro-methodology.mjs";

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
    const versionNumber = detailed ? 2 : 1;
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

  const checklistFor = (targetKey, name, performedBy, type) => {
    if (targetKey === "LADDER") return "ladder";
    if (["LIFTING_BAG", "PIPE_PLUG", "SEALING_BAG"].includes(targetKey))
      return "bag";
    if (targetKey === "FIRE_PUMP")
      return name.includes("sání")
        ? "pump-suction"
        : name.includes("nejvyšší")
          ? "pump-pressure"
          : "pump-weekly";
    if (targetKey === "THERMAL_CAMERA")
      return name.includes("Denní")
        ? "thermal-daily"
        : name.includes("Týdenní")
          ? "thermal-weekly"
          : "thermal-monthly";
    return (
      {
        SUCTION_HOSE: "suction-hose",
        HEIGHT_WORK: "height",
        BOAT_ENGINE: "boat-engine",
        FIREFIGHTER_PPE: "ppe",
        HELMET: "helmet",
        AED: "aed",
        COMPRESSOR: "compressor",
        COMPRESSOR_ASTRA: "compressor",
        COMPRESSOR_TRIDENT: "compressor",
        WATER_RESCUE: "water-rescue",
      }[targetKey] ??
      (type !== "INSPECTION" ||
      /extern|výrobce|servisní organizace|revizní technik/i.test(
        performedBy ?? "",
      )
        ? undefined
        : "general-ts")
    );
  };
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
    const checklistKey = checklistFor(
      entry.targetKey,
      entry.name,
      entry.performedBy,
      entry.type,
    );
    await db.ruleVersion.upsert({
      where: { ruleId_version: { ruleId: found.id, version: 1 } },
      update: {
        validFrom: CEPRO_SOURCE.effectiveFrom,
        intervalValue: entry.intervalValue,
        intervalUnit: entry.intervalUnit,
        trigger: entry.trigger,
        performedBy: entry.performedBy,
        article: entry.article ?? null,
        note:
          entry.note ??
          "Požadavky výrobce stanovené odlišně nebo nad rámec metodiky zůstávají současně platné.",
        checklistTemplateVersionId: checklistKey
          ? checklistVersions.get(checklistKey)
          : null,
      },
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
        checklistTemplateVersionId: checklistKey
          ? checklistVersions.get(checklistKey)
          : null,
      },
    });
  }
}

async function seedInitialAdmin(organizationId) {
  const username = process.env.INITIAL_ADMIN_USERNAME?.trim();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!username || !password) {
    console.info(
      "Počáteční administrátor se nevytváří; inicializační proměnné nejsou nastavené.",
    );
    return;
  }
  const existing = await db.user.findUnique({ where: { username } });
  if (existing) {
    console.info(
      "Počáteční administrátor již existuje; heslo ani role se nemění.",
    );
    return;
  }
  const adminRole = await db.role.findUniqueOrThrow({
    where: { code: "ADMIN" },
  });
  const passwordHash = await hash(password, 12);
  try {
    await db.user.create({
      data: {
        username,
        displayName: "Administrátor",
        passwordHash,
        organizationId,
        roles: { create: { roleId: adminRole.id } },
      },
    });
    console.info("Počáteční administrátor byl vytvořen.");
  } catch (error) {
    if (error?.code === "P2002") {
      console.info(
        "Počáteční administrátor již existuje; heslo ani role se nemění.",
      );
      return;
    }
    throw error;
  }
}

async function main() {
  console.info("=== TSHZS SEED START ===");
  const organization = await seedMasterData();
  await seedInitialAdmin(organization.id);
  console.info("=== TSHZS SEED DONE ===");
}

main()
  .catch((error) => {
    console.error("Inicializace databáze selhala.", error);
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());
