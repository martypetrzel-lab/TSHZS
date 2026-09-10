"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireImportAdministrator } from "@/lib/authorization";
import {
  analyzeWorkbook,
  type ParsedEquipmentRow,
  type ParsedProtocolRow,
} from "@/lib/import/xlsx";
import { getStorage } from "@/lib/storage";
import type { ImportRowStatus } from "@prisma/client";

const defaultMapping = {
  UID: "uid",
  ID: "legacyId",
  "Tech.prostředek": "name",
  "Typ revize/Kontrola": "requirements",
  "Datum kontroly": "lastCompletedAt",
  "Datum příští kontroly": "nextDueAt",
  Vůz: "placement",
  PROTOKOL: "legacyProtocolReference",
};
const statusForDue = (value: string | null) =>
  !value
    ? ("UNDEFINED" as const)
    : new Date(value) < new Date()
      ? ("OVERDUE_BLOCKED" as const)
      : new Date(value).getTime() - Date.now() <= 30 * 86_400_000
        ? ("DUE_SOON" as const)
        : ("COMPLIANT" as const);

export async function analyzeImport(formData: FormData) {
  const user = await requireImportAdministrator();
  const file = formData.get("file");
  if (!(file instanceof File))
    redirect("/administrace/import?chyba=Vyberte%20soubor%20XLSX.");
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const analysis = await analyzeWorkbook(file.name, file.type, bytes);
    const storage = await getStorage().put({
      body: bytes,
      fileName: file.name.replace(/[\\/]/g, "_"),
      mimeType: file.type,
      namespace: "imports/pending",
    });
    const duplicateUids = new Set(
      (
        await prisma.equipmentItem.findMany({
          where: {
            uid: {
              in: [
                ...new Set(
                  [
                    ...analysis.equipment.map((row) => row.uid),
                    ...analysis.protocols.map((row) => row.uid),
                  ].filter(Boolean),
                ),
              ],
            },
          },
          select: { uid: true },
        })
      ).map((item) => item.uid),
    );
    const duplicateProtocols = new Map(
      (
        await prisma.protocol.findMany({
          where: {
            number: {
              in: analysis.protocols.map((row) => row.number).filter(Boolean),
            },
          },
          select: { number: true, equipment: { select: { uid: true } } },
        })
      ).map((protocol) => [protocol.number, protocol.equipment?.uid]),
    );
    const seenUid = new Set<string>();
    const seenProtocol = new Set<string>();
    const rowInputs = [
      ...analysis.equipment.map((row) => {
        const duplicateInFile = seenUid.has(row.uid);
        seenUid.add(row.uid);
        const messages = [
          ...row.errors,
          ...row.warnings,
          ...(duplicateInFile ? ["Duplicitní UID v souboru."] : []),
        ];
        const status = (
          row.errors.length || duplicateInFile
            ? "ERROR"
            : row.warnings.length
              ? "WARNING"
              : duplicateUids.has(row.uid)
                ? "UPDATE"
                : "NEW"
        ) as ImportRowStatus;
        return {
          sheetName: row.sheetName,
          rowNumber: row.rowNumber,
          uid: row.uid || null,
          action: duplicateUids.has(row.uid) ? "UPDATE_SAFE_FIELDS" : "CREATE",
          status,
          message: messages.join(" ") || null,
          rawData: row.raw,
          previewData: row,
        };
      }),
      ...analysis.protocols.map((row) => {
        const duplicateInFile = seenProtocol.has(row.number);
        seenProtocol.add(row.number);
        const existingUid = duplicateProtocols.get(row.number);
        const conflict = Boolean(existingUid && existingUid !== row.uid);
        const missingEquipment =
          !duplicateUids.has(row.uid) &&
          !analysis.equipment.some((equipment) => equipment.uid === row.uid);
        const messages = [
          ...row.errors,
          ...row.warnings,
          ...(duplicateInFile ? ["Duplicitní PROT v souboru."] : []),
          ...(conflict ? [`PROT již patří UID ${existingUid}.`] : []),
          ...(missingEquipment
            ? [
                "UID historického protokolu neexistuje v databázi ani v importovaném seznamu.",
              ]
            : []),
        ];
        const status = (
          row.errors.length || duplicateInFile || conflict || missingEquipment
            ? "ERROR"
            : existingUid === row.uid
              ? "SKIP"
              : row.warnings.length
                ? "WARNING"
                : "NEW"
        ) as ImportRowStatus;
        return {
          sheetName: row.sheetName,
          rowNumber: row.rowNumber,
          uid: row.uid || null,
          action: status === "SKIP" ? "SKIP" : "CREATE",
          status,
          message: messages.join(" ") || null,
          rawData: row.snapshot,
          previewData: row,
        };
      }),
    ];
    const warningRows = rowInputs.filter(
      (row) => row.status === "WARNING",
    ).length;
    const errorRows = rowInputs.filter((row) => row.status === "ERROR").length;
    const job = await prisma.importJob.create({
      data: {
        fileName: file.name,
        checksum: analysis.checksum,
        sizeBytes: storage.sizeBytes,
        storageKey: storage.storageKey,
        uploadedById: user.id,
        totalRows: rowInputs.length,
        warningRows,
        errorRows,
        mappingJson: defaultMapping,
        summaryJson: {
          sheets: analysis.sheets,
          equipmentFound: analysis.equipment.length,
          protocolsFound: analysis.protocols.length,
          hasLegacyChecklist: analysis.hasLegacyChecklist,
          analysisErrors: analysis.errors,
        },
        rows: { create: rowInputs },
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "IMPORT_ANALYZE",
        entityType: "ImportJob",
        entityId: job.id,
        newValue: {
          fileName: file.name,
          checksum: analysis.checksum,
          rows: rowInputs.length,
        },
      },
    });
    redirect(`/administrace/import/${job.id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error("Analýza XLSX selhala", { userId: user.id, error });
    redirect(
      `/administrace/import?chyba=${encodeURIComponent(error instanceof Error ? error.message : "Analýza souboru selhala.")}`,
    );
  }
}

export async function runDryImport(formData: FormData) {
  const user = await requireImportAdministrator();
  const jobId = String(formData.get("jobId") ?? "");
  const job = await prisma.importJob.findUnique({
    where: { id: jobId },
    include: { rows: true },
  });
  if (!job) redirect("/administrace/import?chyba=Import%20neexistuje.");
  const hasErrors = job.rows.some((row) => row.status === "ERROR");
  await prisma.importJob.update({
    where: { id: job.id },
    data: {
      status: "DRY_RUN_READY",
      summaryJson: {
        ...((job.summaryJson as object) ?? {}),
        dryRunAt: new Date().toISOString(),
        dryRunPassed: !hasErrors,
      },
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "IMPORT_DRY_RUN",
      entityType: "ImportJob",
      entityId: job.id,
      newValue: { passed: !hasErrors },
    },
  });
  revalidatePath(`/administrace/import/${job.id}`);
  redirect(`/administrace/import/${job.id}?dry=1`);
}

async function ensureMasterData(organizationId: string) {
  const station = await prisma.station.upsert({
    where: { organizationId_name: { organizationId, name: "Mstětice" } },
    update: {},
    create: { organizationId, name: "Mstětice" },
  });
  const location = await prisma.location.upsert({
    where: { seedKey: "mstetice:station" },
    update: {},
    create: {
      seedKey: "mstetice:station",
      stationId: station.id,
      name: "Stanice",
    },
  });
  const category = await prisma.equipmentCategory.upsert({
    where: { code: "IMPORT-UNASSIGNED" },
    update: { name: "Nezařazené – import" },
    create: { code: "IMPORT-UNASSIGNED", name: "Nezařazené – import" },
  });
  const vehicles = new Map<string, string>();
  for (const name of ["PHA", "SCANIA", "TA"]) {
    const found = await prisma.vehicle.findFirst({
      where: { stationId: station.id, name, archivedAt: null },
    });
    const vehicle =
      found ??
      (await prisma.vehicle.create({ data: { stationId: station.id, name } }));
    vehicles.set(name, vehicle.id);
  }
  const source = await prisma.sourceDocument.upsert({
    where: { seedKey: "legacy-import" },
    update: {},
    create: {
      seedKey: "legacy-import",
      title: "Importovaná původní evidence",
      sourceType: "LEGACY_IMPORT",
    },
  });
  const versions = new Map<string, string>();
  for (const spec of [
    {
      key: "annual",
      name: "Roční",
      type: "INSPECTION",
      value: 12,
      unit: "MONTHS",
    },
    {
      key: "semiannual",
      name: "Půlroční",
      type: "INSPECTION",
      value: 6,
      unit: "MONTHS",
    },
    {
      key: "weekly",
      name: "Týdenní kontrola",
      type: "INSPECTION",
      value: 1,
      unit: "WEEKS",
    },
    {
      key: "revision",
      name: "Revize",
      type: "REVISION",
      value: null,
      unit: null,
    },
  ] as const) {
    const rule = await prisma.rule.upsert({
      where: { seedKey: `legacy-import:${spec.key}` },
      update: {},
      create: {
        seedKey: `legacy-import:${spec.key}`,
        name: spec.name,
        requirementType: spec.type,
        sourceType: "LEGACY_IMPORT",
        sourceDocumentId: source.id,
      },
    });
    const version = await prisma.ruleVersion.upsert({
      where: { ruleId_version: { ruleId: rule.id, version: 1 } },
      update: {},
      create: {
        ruleId: rule.id,
        version: 1,
        validFrom: new Date("1900-01-01T12:00:00Z"),
        intervalValue: spec.value,
        intervalUnit: spec.unit,
        note: "Převzato ze staré provozní evidence; nejde o oficiální právní pravidlo.",
      },
    });
    versions.set(spec.key, version.id);
  }
  const template = await prisma.checklistTemplate.upsert({
    where: { seedKey: "checklist:legacy-general" },
    update: {},
    create: {
      seedKey: "checklist:legacy-general",
      name: "Původní obecný checklist",
    },
  });
  const existingVersion = await prisma.checklistTemplateVersion.findUnique({
    where: { templateId_version: { templateId: template.id, version: 1 } },
  });
  if (!existingVersion)
    await prisma.checklistTemplateVersion.create({
      data: {
        templateId: template.id,
        version: 1,
        sections: {
          create: {
            title: "Původní kontrolní body",
            sortOrder: 1,
            items: {
              create: [
                "Vizuální kontrola",
                "Mechanické poškození",
                "Funkčnost",
                "Znečištění",
                "Viditelné ID",
                "Kompletnost",
                "Poznámky",
              ].map((label, index) => ({
                label,
                responseType: label === "Poznámky" ? "TEXT" : "PASS_FAIL_NA",
                required: label !== "Poznámky",
                sortOrder: index,
              })),
            },
          },
        },
      },
    });
  return { station, location, category, vehicles, versions };
}

export async function executeImport(formData: FormData) {
  const user = await requireImportAdministrator();
  const jobId = String(formData.get("jobId") ?? "");
  const job = await prisma.importJob.findUnique({
    where: { id: jobId },
    include: {
      rows: { orderBy: [{ sheetName: "asc" }, { rowNumber: "asc" }] },
    },
  });
  if (!job || job.status !== "DRY_RUN_READY")
    redirect(
      `/administrace/import/${jobId}?chyba=Nejprve%20proveďte%20dry-run.`,
    );
  if (job.rows.some((row) => row.status === "ERROR"))
    redirect(
      `/administrace/import/${jobId}?chyba=Import%20obsahuje%20chyby,%20které%20je%20nutné%20opravit.`,
    );
  await prisma.importJob.update({
    where: { id: job.id },
    data: { status: "RUNNING" },
  });
  let created = 0,
    updated = 0,
    skipped = 0,
    errors = 0,
    requirements = 0,
    protocols = 0;
  try {
    const account = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { organizationId: true },
    });
    const master = await ensureMasterData(account.organizationId);
    for (const importRow of job.rows.filter(
      (row) => row.sheetName === "Kontrola 1" && row.status !== "ERROR",
    )) {
      const row = importRow.previewData as unknown as ParsedEquipmentRow;
      try {
        const result = await prisma.$transaction(async (tx) => {
          const existing = await tx.equipmentItem.findUnique({
            where: { uid: row.uid },
          });
          const placement = row.vehicle.toUpperCase();
          const vehicleId = master.vehicles.get(placement) ?? null;
          const locationId =
            placement === "STANICE" || !vehicleId ? master.location.id : null;
          const item = existing
            ? await tx.equipmentItem.update({
                where: { id: existing.id },
                data: {
                  legacyId: existing.legacyId || row.legacyId || null,
                  legacyProtocolReference:
                    existing.legacyProtocolReference ||
                    row.protocolReference ||
                    null,
                  vehicleId:
                    existing.vehicleId || existing.locationId
                      ? undefined
                      : vehicleId,
                  locationId:
                    existing.vehicleId || existing.locationId
                      ? undefined
                      : locationId,
                },
              })
            : await tx.equipmentItem.create({
                data: {
                  uid: row.uid,
                  legacyId: row.legacyId || null,
                  legacyProtocolReference: row.protocolReference || null,
                  name: row.name,
                  categoryId: master.category.id,
                  organizationId: account.organizationId,
                  stationId: master.station.id,
                  vehicleId,
                  locationId,
                  importedAt: new Date(),
                  importJobId: job.id,
                  status: "IN_STOCK",
                  complianceStatus: statusForDue(row.nextDueAt),
                  createdById: user.id,
                },
              });
          for (const requirement of row.requirements) {
            const ruleVersionId = master.versions.get(requirement.key)!;
            const found = await tx.equipmentRequirement.findFirst({
              where: { equipmentId: item.id, ruleVersionId },
            });
            if (!found) {
              await tx.equipmentRequirement.create({
                data: {
                  equipmentId: item.id,
                  ruleVersionId,
                  type: requirement.type,
                  name: requirement.name,
                  lastCompletedAt: row.lastCompletedAt
                    ? new Date(row.lastCompletedAt)
                    : null,
                  nextDueAt: row.nextDueAt ? new Date(row.nextDueAt) : null,
                  status: statusForDue(row.nextDueAt),
                },
              });
              requirements++;
            }
          }
          return { item, existed: Boolean(existing) };
        });
        if (result.existed) updated++;
        else created++;
        await prisma.importRow.update({
          where: { id: importRow.id },
          data: { status: "IMPORTED", resultEntityId: result.item.id },
        });
      } catch (error) {
        errors++;
        await prisma.importRow.update({
          where: { id: importRow.id },
          data: {
            status: "ERROR",
            message:
              error instanceof Error
                ? error.message.slice(0, 500)
                : "Import řádku selhal.",
          },
        });
      }
    }
    for (const importRow of job.rows.filter(
      (row) => row.sheetName === "Historie protokolů" && row.status !== "ERROR",
    )) {
      if (importRow.status === "SKIP") {
        skipped++;
        continue;
      }
      const row = importRow.previewData as unknown as ParsedProtocolRow;
      try {
        const item = await prisma.equipmentItem.findUnique({
          where: { uid: row.uid },
        });
        if (!item)
          throw new Error(
            "UID historického protokolu nebylo nalezeno mezi prostředky.",
          );
        const existing = await prisma.protocol.findUnique({
          where: { number: row.number },
          include: { equipment: true },
        });
        if (existing) {
          if (existing.equipment?.uid !== row.uid)
            throw new Error("Protokol je napojen na jiné UID.");
          skipped++;
          continue;
        }
        const protocol = await prisma.protocol.create({
          data: {
            number: row.number,
            equipmentId: item.id,
            snapshot: {
              ...row.snapshot,
              source: "Importovaná původní evidence",
              immutable: true,
            },
            externalUrl: row.externalUrl,
            legacyImported: true,
            importJobId: job.id,
          },
        });
        protocols++;
        await prisma.importRow.update({
          where: { id: importRow.id },
          data: { status: "IMPORTED", resultEntityId: protocol.id },
        });
      } catch (error) {
        errors++;
        await prisma.importRow.update({
          where: { id: importRow.id },
          data: {
            status: "ERROR",
            message:
              error instanceof Error
                ? error.message.slice(0, 500)
                : "Import protokolu selhal.",
          },
        });
      }
    }
    const finishedAt = new Date();
    const summary = {
      equipment: {
        found: job.rows.filter((row) => row.sheetName === "Kontrola 1").length,
        created,
        updated,
        skipped: 0,
        errors,
      },
      protocols: {
        found: job.rows.filter((row) => row.sheetName === "Historie protokolů")
          .length,
        created: protocols,
        skipped,
      },
      requirements: { created: requirements },
      warnings: job.warningRows,
    };
    await prisma.$transaction([
      prisma.importJob.update({
        where: { id: job.id },
        data: {
          status: errors ? "FAILED" : "COMPLETED",
          finishedAt,
          createdRows: created + protocols,
          updatedRows: updated,
          skippedRows: skipped,
          errorRows: errors,
          summaryJson: summary,
        },
      }),
      prisma.attachment.create({
        data: {
          ownerType: "ImportJob",
          ownerId: job.id,
          fileName: job.fileName,
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          sizeBytes: job.sizeBytes,
          storageKey: job.storageKey!,
          checksumSha256: job.checksum,
          uploadedById: user.id,
        },
      }),
      prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "IMPORT_EXECUTE",
          entityType: "ImportJob",
          entityId: job.id,
          newValue: summary,
        },
      }),
    ]);
  } catch (error) {
    console.error("Import XLSX selhal", { jobId, userId: user.id, error });
    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorRows: { increment: 1 },
      },
    });
  }
  revalidatePath("/prostredky");
  revalidatePath(`/administrace/import/${job.id}`);
  redirect(`/administrace/import/${job.id}?hotovo=1`);
}
