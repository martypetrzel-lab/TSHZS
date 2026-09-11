"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ImportRowStatus, Prisma } from "@prisma/client";
import { requireImportAdministrator } from "@/lib/authorization";
import {
  analyzeEquipmentCards,
  cardConflicts,
  matchEquipmentCard,
  type ParsedEquipmentCard,
} from "@/lib/import/equipment-cards";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";

export async function analyzeEquipmentCardImport(formData: FormData) {
  const user = await requireImportAdministrator(),
    file = formData.get("file");
  if (!(file instanceof File))
    redirect("/administrace/import/karty?chyba=Vyberte+soubor+XLSX");
  try {
    const bytes = new Uint8Array(await file.arrayBuffer()),
      analysis = await analyzeEquipmentCards(file.name, file.type, bytes),
      stored = await getStorage().put({
        body: bytes,
        fileName: file.name.replace(/[\\/]/g, "_"),
        mimeType:
          file.type ||
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        namespace: "imports/equipment-cards",
      });
    const candidates = await prisma.equipmentItem.findMany({
      where: { archivedAt: null, organizationId: user.organizationId },
      select: {
        id: true,
        name: true,
        manufacturer: true,
        typeName: true,
        serialNumber: true,
        registrationNumber: true,
        legacyIdentificationNumber: true,
      },
    });
    const rows = analysis.cards.map((card) => {
      const match = matchEquipmentCard(card, candidates),
        candidate = "candidate" in match ? match.candidate : undefined,
        conflicts = candidate ? cardConflicts(card, candidate) : [];
      const status: ImportRowStatus = card.errors.length
        ? "ERROR"
        : match.status === "EXACT"
          ? conflicts.length
            ? "WARNING"
            : "UPDATE"
          : match.status === "NEW"
            ? "NEW"
            : "WARNING";
      return {
        sheetName: card.sheetName,
        rowNumber: 1,
        action: match.status === "NEW" ? "CREATE_CARD" : "REVIEW_CARD_MATCH",
        status,
        message: [
          ...card.errors,
          ...card.warnings,
          match.reason,
          ...(conflicts.length
            ? [`${conflicts.length} konfliktních hodnot.`]
            : []),
        ].join(" "),
        rawData: { fields: card.fields, unknownRows: card.unknownRows },
        previewData: { kind: "EQUIPMENT_CARD", card, match, conflicts },
      };
    });
    const job = await prisma.importJob.create({
      data: {
        fileName: file.name,
        checksum: analysis.checksum,
        sizeBytes: stored.sizeBytes,
        storageKey: stored.storageKey,
        uploadedById: user.id,
        totalRows: rows.length,
        warningRows: rows.filter((r) => r.status === "WARNING").length,
        errorRows: rows.filter((r) => r.status === "ERROR").length,
        summaryJson: {
          kind: "EQUIPMENT_CARDS",
          sheets: analysis.sheets,
          cards: analysis.cards.length,
          ignoredSheets: analysis.sheets - analysis.cards.length,
        },
        mappingJson: { mode: "ONE_SHEET_ONE_CARD" },
        rows: { create: rows },
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "EQUIPMENT_CARDS_ANALYZE",
        entityType: "ImportJob",
        entityId: job.id,
        newValue: {
          fileName: file.name,
          cards: rows.length,
          storageKey: stored.storageKey,
        },
      },
    });
    redirect(`/administrace/import/karty/${job.id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error("Analýza karet prostředků selhala", {
      userId: user.id,
      error,
    });
    redirect(
      `/administrace/import/karty?chyba=${encodeURIComponent(error instanceof Error ? error.message : "Analýza souboru selhala.")}`,
    );
  }
}

const fieldMap = {
  name: "name",
  manufacturer: "manufacturer",
  typeName: "typeName",
  serialNumber: "serialNumber",
  registrationNumber: "registrationNumber",
  legacyIdentificationNumber: "legacyIdentificationNumber",
  material: "material",
  model: "model",
  technicalDescription: "technicalDescription",
  assignedPersonText: "assignedPersonText",
} as const;
const parsedDate = (field: { value: string } | undefined) => {
  if (!field) return null;
  const d = new Date(field.value);
  return Number.isNaN(d.getTime()) ? null : d;
};
async function persistCard(
  tx: Prisma.TransactionClient,
  card: ParsedEquipmentCard,
  equipmentId: string,
  job: { id: string; fileName: string },
  userId: string,
  fieldsToApply: Set<string>,
) {
  const update: Prisma.EquipmentItemUpdateInput = {};
  for (const [source, target] of Object.entries(fieldMap)) {
    const field = card.fields[source];
    if (field && fieldsToApply.has(source))
      Object.assign(update, { [target]: field.value });
  }
  const manufacturedAt = parsedDate(card.fields.manufacturedAt),
    commissionedAt = parsedDate(card.fields.commissionedAt);
  if (fieldsToApply.has("manufacturedAt")) {
    update.manufacturedAt = manufacturedAt;
    update.manufacturingText = manufacturedAt
      ? null
      : (card.fields.manufacturedAt?.value ?? null);
  }
  if (fieldsToApply.has("commissionedAt")) {
    update.commissionedAt = commissionedAt;
    update.commissioningText = commissionedAt
      ? null
      : (card.fields.commissionedAt?.value ?? null);
  }
  await tx.equipmentItem.update({ where: { id: equipmentId }, data: update });
  if (card.specifications.length)
    await tx.equipmentSpecification.createMany({
      skipDuplicates: true,
      data: card.specifications.map((s) => ({
        equipmentId,
        name: s.name,
        value: s.value,
        unit: s.unit,
        sortOrder: s.sortOrder,
        source: "LEGACY_EQUIPMENT_CARD",
        sourceFile: job.fileName,
        sourceSheet: card.sheetName,
        sourceRow: s.sourceRow,
        importJobId: job.id,
      })),
    });
  if (card.logEntries.length)
    await tx.equipmentLogEntry.createMany({
      skipDuplicates: true,
      data: card.logEntries.map((e) => ({
        equipmentId,
        eventType: e.eventType,
        occurredAt: e.occurredAt ? new Date(e.occurredAt) : null,
        locationText: e.locationText,
        durationMinutes: e.durationMinutes,
        description: e.description,
        defectDescription: e.defectDescription,
        remedyDescription: e.remedyDescription,
        note: e.note,
        legacySignatureText: e.legacySignatureText,
        createdById: userId,
        source: "LEGACY_EQUIPMENT_CARD",
        legacyImported: true,
        sourceFile: job.fileName,
        sourceSheet: card.sheetName,
        sourceRow: e.sourceRow,
        importJobId: job.id,
      })),
    });
  await tx.importedFieldValue.createMany({
    skipDuplicates: true,
    data: Object.entries(card.fields)
      .filter(([key]) => fieldsToApply.has(key))
      .map(([fieldName, field]) => ({
        entityType: "EquipmentItem",
        entityId: equipmentId,
        fieldName,
        valueText: field.value,
        sourceFile: job.fileName,
        sourceSheet: card.sheetName,
        sourceRow: field.row,
        importJobId: job.id,
      })),
  });
}

export async function confirmEquipmentCardImport(formData: FormData) {
  const user = await requireImportAdministrator(),
    jobId = String(formData.get("jobId") ?? ""),
    job = await prisma.importJob.findUnique({
      where: { id: jobId },
      include: { rows: { orderBy: { sheetName: "asc" } } },
    });
  if (!job) redirect("/administrace/import/karty?chyba=Import+neexistuje");
  if (job.status === "COMPLETED")
    redirect(`/administrace/import/karty/${job.id}?hotovo=1`);
  if ((job.summaryJson as { kind?: string } | null)?.kind !== "EQUIPMENT_CARDS")
    redirect("/administrace/import?chyba=Neplatný+typ+importu");
  let created = 0,
    updated = 0,
    skipped = 0;
  await prisma.$transaction(async (tx) => {
    const station = await tx.station.findFirst({
        where: { organizationId: user.organizationId },
        orderBy: { name: "asc" },
      }),
      category = await tx.equipmentCategory.findFirst({
        where: { archivedAt: null },
        orderBy: { code: "asc" },
      });
    if (!station || !category)
      throw new Error("Chybí stanice nebo výchozí kategorie.");
    for (const row of job.rows) {
      const preview = row.previewData as unknown as {
          card: ParsedEquipmentCard;
          match: { candidate?: { id: string } };
        },
        card = preview.card,
        decision = String(formData.get(`decision-${row.id}`) ?? "");
      if (row.status === "ERROR" && decision !== "skip")
        throw new Error(
          `List ${card.sheetName} obsahuje chybu a lze jej pouze přeskočit.`,
        );
      if (decision === "skip") {
        await tx.importRow.update({
          where: { id: row.id },
          data: { status: "SKIP", action: "SKIP" },
        });
        skipped++;
        continue;
      }
      let equipmentId: string,
        allFields = new Set(Object.keys(card.fields));
      if (decision.startsWith("match:")) {
        equipmentId = decision.slice(6);
        const exists = await tx.equipmentItem.findFirst({
          where: { id: equipmentId, organizationId: user.organizationId },
        });
        if (!exists)
          throw new Error(
            `Vybraný prostředek pro list ${card.sheetName} neexistuje.`,
          );
        allFields = new Set(
          [...allFields].filter(
            (field) =>
              formData.get(`apply-${row.id}-${field}`) === "on" ||
              !(
                row.previewData as unknown as {
                  conflicts: Array<{ field: string }>;
                }
              ).conflicts.some((c) => c.field === field),
          ),
        );
        updated++;
      } else if (decision === "create") {
        const uid = `KARTA-${createHash("sha256").update(`${job.id}:${card.sheetName}`).digest("hex").slice(0, 12).toUpperCase()}`,
          name =
            card.fields.name?.value ||
            card.fields.typeName?.value ||
            `Neurčený prostředek – karta ${card.sheetName}`;
        const vehicleName = card.fields.vehicle?.value;
        const registrationPlate = card.fields.registrationPlate?.value;
        const vehicle =
          vehicleName || registrationPlate
            ? await tx.vehicle.findFirst({
                where: {
                  station: { organizationId: user.organizationId },
                  archivedAt: null,
                  OR: [
                    ...(vehicleName
                      ? [
                          {
                            name: {
                              equals: vehicleName,
                              mode: "insensitive" as const,
                            },
                          },
                        ]
                      : []),
                    ...(registrationPlate
                      ? [
                          {
                            registrationPlate: {
                              equals: registrationPlate,
                              mode: "insensitive" as const,
                            },
                          },
                        ]
                      : []),
                  ],
                },
              })
            : null;
        const item = await tx.equipmentItem.create({
          data: {
            uid,
            name,
            categoryId: category.id,
            organizationId: user.organizationId,
            stationId: station.id,
            vehicleId: vehicle?.id,
            status: "IN_STOCK",
            needsReview: true,
            importedAt: new Date(),
            importJobId: job.id,
            createdById: user.id,
          },
        });
        equipmentId = item.id;
        created++;
      } else
        throw new Error(`List ${card.sheetName} nemá potvrzené rozhodnutí.`);
      await persistCard(
        tx,
        card,
        equipmentId,
        { id: job.id, fileName: job.fileName },
        user.id,
        allFields,
      );
      await tx.importRow.update({
        where: { id: row.id },
        data: {
          status: "IMPORTED",
          resultEntityId: equipmentId,
          action: decision.startsWith("match:")
            ? "MERGE_CONFIRMED"
            : "CREATE_CONFIRMED",
        },
      });
    }
    await tx.importJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
        createdRows: created,
        updatedRows: updated,
        skippedRows: skipped,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "EQUIPMENT_CARDS_IMPORT",
        entityType: "ImportJob",
        entityId: job.id,
        newValue: { created, updated, skipped },
        reason: "Uživatelem potvrzený náhled karet prostředků",
      },
    });
  });
  revalidatePath("/prostredky");
  redirect(`/administrace/import/karty/${job.id}?hotovo=1`);
}
