"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSystemAdministrator } from "@/lib/authorization";
import { requireOperationalPermission } from "@/lib/operational-authorization";
import { operationalCounterKey, protocolTypes, type OperationalType, assertFinancialApproval, assertRepairTransition } from "@/lib/operational-workflow";
import { parseDateOnly, todayDateKey, dateKey } from "@/lib/inspection-lifecycle";
import { prisma } from "@/lib/prisma";

const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

export async function grantOperationalPermission(form: FormData) {
  const actor = await requireSystemAdministrator();
  const userId = value(form, "userId");
  if (!await prisma.user.findFirst({ where: { id: userId, organizationId: actor.organizationId } })) throw new Error("Uživatel neexistuje.");
  const code = value(form, "permission");
  const allowed = ["protocol:read", "protocol:create", "protocol:edit_draft", "protocol:issue", "protocol:cancel", "protocol:download", "handover:confirm", "handover:return", "equipment:out_of_service", "equipment:return_to_service", "repair:create", "repair:approve", "repair:manage", "repair:costs_read", "repair:costs_edit", "supplier:manage"];
  if (!allowed.includes(code)) throw new Error("Neznámé oprávnění.");
  await prisma.$transaction(async tx => {
    const permission = await tx.permission.upsert({ where: { code }, create: { code, name: code }, update: {} });
    if (form.get("revoke") === "on") await tx.userPermission.deleteMany({ where: { userId, permissionId: permission.id } });
    else await tx.userPermission.upsert({ where: { userId_permissionId: { userId, permissionId: permission.id } }, create: { userId, permissionId: permission.id }, update: {} });
    await tx.auditLog.create({ data: { userId: actor.id, action: "USER_PERMISSION_CHANGED", entityType: "User", entityId: userId, newValue: { permission: code, granted: form.get("revoke") !== "on" } } });
  });
  revalidatePath("/administrace/opravneni");
}

export async function saveOperationalDraft(form: FormData) {
  const user = await requireOperationalPermission("protocol:create");
  const type = value(form, "type") as OperationalType;
  if (!(type in protocolTypes)) throw new Error("Vyberte druh dokumentu.");
  const equipmentIds = [...new Set(form.getAll("equipmentId").map(String).filter(Boolean))];
  if (!equipmentIds.length || (type !== "HANDOVER" && equipmentIds.length !== 1)) throw new Error("Vyberte odpovídající počet prostředků.");
  const equipment = await prisma.equipmentItem.findMany({ where: { id: { in: equipmentIds }, organizationId: user.organizationId, archivedAt: null } });
  if (equipment.length !== equipmentIds.length) throw new Error("Některý prostředek není dostupný.");
  const data = Object.fromEntries(["reason", "description", "solution", "justification", "sender", "recipient", "recipientOrganization", "recipientAddress", "recipientPhone", "recipientEmail", "place", "accessories", "condition", "note", "expectedReturn", "estimatedCost", "currency", "dueDate", "priority", "handoverPurpose"].map(key => [key, value(form, key)]));
  if (!data.reason) throw new Error("Důvod je povinný.");
  const protocolDate = parseDateOnly(form.get("protocolDate"), "Datum protokolu");
  const occurred = value(form, "eventOccurredAt");
  const id = value(form, "id");
  const document = await prisma.$transaction(async tx => {
    if (id) {
      await requireOperationalPermission("protocol:edit_draft");
      const current = await tx.operationalProtocol.findFirst({ where: { id, organizationId: user.organizationId, status: "DRAFT", createdById: user.id } });
      if (!current) throw new Error("Rozpracovaný dokument není dostupný.");
      if (current.type !== type) throw new Error("Druh existujícího dokumentu nelze změnit.");
      await tx.operationalProtocolItem.deleteMany({ where: { protocolId: id } });
      const result = await tx.operationalProtocol.update({ where: { id }, data: { draftData: data, protocolDate, eventOccurredAt: occurred ? parseDateOnly(occurred, "Datum události") : null, items: { create: equipmentIds.map(equipmentId => ({ equipmentId, details: { condition: data.condition, accessories: data.accessories } })) } } });
      await tx.auditLog.create({ data: { userId: user.id, action: "PROTOCOL_DRAFT_UPDATED", entityType: "OperationalProtocol", entityId: id, previousValue: current.draftData ?? Prisma.JsonNull, newValue: data } });
      return result;
    }
    const result = await tx.operationalProtocol.create({ data: { organizationId: user.organizationId, type, title: protocolTypes[type], protocolDate, createdById: user.id, eventOccurredAt: occurred ? parseDateOnly(occurred, "Datum události") : null, draftData: data, items: { create: equipmentIds.map(equipmentId => ({ equipmentId, details: { condition: data.condition, accessories: data.accessories } })) } } });
    await tx.auditLog.create({ data: { userId: user.id, action: "PROTOCOL_CREATED", entityType: "OperationalProtocol", entityId: result.id, newValue: { type, equipmentIds } } });
    return result;
  }, transactionOptions);
  redirect(`/protokoly/provozni/${document.id}`);
}

export async function issueOperationalProtocol(form: FormData) {
  const user = await requireOperationalPermission("protocol:issue");
  const id = value(form, "id");
  await prisma.$transaction(async tx => {
    const doc = await tx.operationalProtocol.findFirst({ where: { id, organizationId: user.organizationId }, include: { items: true } });
    if (!doc) throw new Error("Dokument neexistuje.");
    if (doc.status === "ISSUED") return;
    if (doc.status !== "DRAFT") throw new Error("Dokument nelze vystavit.");
    const draftData = doc.draftData as Record<string, string>;
    if (doc.type === "REPAIR_PROPOSAL" && (!draftData.description || !draftData.solution || !draftData.justification)) throw new Error("Před vystavením doplňte popis závady, navrhovanou opravu a odůvodnění.");
    if (doc.type === "HANDOVER" && (!draftData.sender || !draftData.recipient || !draftData.place || !["SERVICE", "LOAN"].includes(draftData.handoverPurpose))) throw new Error("Před vystavením doplňte předávajícího, příjemce, místo a účel předání.");
    if (dateKey(doc.protocolDate) > todayDateKey()) throw new Error("Budoucí dokument ponechte rozpracovaný.");
    if (doc.eventOccurredAt && dateKey(doc.eventOccurredAt) > todayDateKey()) throw new Error("Budoucí událost nelze potvrdit jako skutečnou.");
    const equipment = await tx.equipmentItem.findMany({ where: { id: { in: doc.items.map(i => i.equipmentId) }, organizationId: user.organizationId } });
    if (equipment.length !== doc.items.length) throw new Error("Nedostupné prostředky.");
    const key = operationalCounterKey(doc.type, doc.protocolDate);
    const counter = await tx.protocolCounter.upsert({ where: { key }, create: { key, currentValue: 1 }, update: { currentValue: { increment: 1 } } });
    const number = `${key}-${String(counter.currentValue).padStart(6, "0")}`;
    const snapshot = { type: doc.type, title: doc.title, number, protocolDate: doc.protocolDate.toISOString(), eventOccurredAt: doc.eventOccurredAt?.toISOString() ?? null, author: user.displayName, data: doc.draftData, equipment: equipment.map(e => ({ id: e.id, name: e.name, uid: e.uid, serialNumber: e.serialNumber, registrationNumber: e.registrationNumber, manufacturer: e.manufacturer, model: e.model, status: e.status })), items: doc.items.map(i => ({ equipmentId: i.equipmentId, quantity: i.quantity, details: i.details })) };
    await tx.operationalProtocol.update({ where: { id }, data: { number, status: "ISSUED", issuedAt: new Date(), issuedById: user.id, snapshot: snapshot as Prisma.InputJsonValue } });
    await tx.auditLog.create({ data: { userId: user.id, action: "PROTOCOL_ISSUED", entityType: "OperationalProtocol", entityId: id, newValue: { number } } });
  }, transactionOptions);
  revalidatePath("/protokoly"); revalidatePath(`/protokoly/provozni/${id}`);
}

export async function cancelOperationalProtocol(form: FormData) {
  const user = await requireOperationalPermission("protocol:cancel");
  const id = value(form, "id"), reason = value(form, "reason");
  if (!reason) throw new Error("Důvod storna je povinný.");
  await prisma.$transaction(async tx => {
    const changed = await tx.operationalProtocol.updateMany({ where: { id, organizationId: user.organizationId, status: "ISSUED" }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: user.id, cancellationReason: reason } });
    if (changed.count) await tx.auditLog.create({ data: { userId: user.id, action: "PROTOCOL_CANCELLED", entityType: "OperationalProtocol", entityId: id, reason } });
  });
  revalidatePath("/protokoly"); revalidatePath(`/protokoly/provozni/${id}`);
}

export async function deleteOperationalDraft(form: FormData) {
  const user = await requireOperationalPermission("protocol:edit_draft");
  const id = value(form, "id");
  await prisma.$transaction(async tx => {
    const changed = await tx.operationalProtocol.deleteMany({ where: { id, organizationId: user.organizationId, status: "DRAFT", createdById: user.id } });
    if (changed.count) await tx.auditLog.create({ data: { userId: user.id, action: "PROTOCOL_DRAFT_DELETED", entityType: "OperationalProtocol", entityId: id } });
  });
  redirect("/protokoly");
}

export async function decideRepairProposal(form: FormData) {
  const actor = await requireOperationalPermission("repair:approve");
  const id = value(form, "id"), decision = value(form, "decision"), reason = value(form, "reason");
  if (!["APPROVED", "REJECTED", "CHANGES_REQUIRED"].includes(decision)) throw new Error("Neplatné rozhodnutí.");
  await prisma.$transaction(async tx => {
    const doc = await tx.operationalProtocol.findFirst({ where: { id, organizationId: actor.organizationId, type: "REPAIR_PROPOSAL", status: "ISSUED" }, include: { repairCase: true } });
    const submission = await tx.auditLog.findFirst({ where: { action: "REPAIR_SUBMITTED", entityType: "OperationalProtocol", entityId: id } });
    const repairId = (submission?.newValue as { repairCaseId?: string } | null)?.repairCaseId;
    const repair = repairId ? await tx.repairCase.findFirst({ where: { id: repairId, organizationId: actor.organizationId } }) : null;
    if (!doc || !repair || repair.state !== "PENDING_APPROVAL") throw new Error("Návrh nečeká na rozhodnutí.");
    assertFinancialApproval({ authorId: doc.createdById, actorId: actor.id, allowed: true, reason });
    const limit = decision === "APPROVED" ? new Prisma.Decimal(value(form, "approvedLimit")) : null;
    if (limit?.isNegative()) throw new Error("Limit nesmí být záporný.");
    await tx.repairDecision.create({ data: { protocolId: id, repairCaseId: repair.id, decision, decidedById: actor.id, reason, approvedLimit: limit, conditions: value(form, "conditions") } });
    await tx.repairCase.update({ where: { id: repair.id }, data: { state: decision as "APPROVED" | "REJECTED" | "CHANGES_REQUIRED", approvedLimit: limit } });
    await tx.repairEvent.create({ data: { repairCaseId: repair.id, previousState: "PENDING_APPROVAL", newState: decision as "APPROVED" | "REJECTED" | "CHANGES_REQUIRED", userId: actor.id, note: reason } });
    await tx.auditLog.create({ data: { userId: actor.id, action: `REPAIR_${decision === "CHANGES_REQUIRED" ? "RETURNED_FOR_CHANGES" : decision}`, entityType: "OperationalProtocol", entityId: id, reason } });
  }, transactionOptions);
  revalidatePath(`/protokoly/provozni/${id}`);
}

export async function advanceRepair(form: FormData) {
  const user = await requireOperationalPermission("repair:manage");
  const id = value(form, "repairCaseId"), next = value(form, "state");
  if (["APPROVED", "REJECTED", "CHANGES_REQUIRED", "CLOSED", "PENDING_APPROVAL"].includes(next)) throw new Error("Použijte příslušné schvalovací nebo návratové workflow.");
  await prisma.$transaction(async tx => {
    const current = await tx.repairCase.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!current) throw new Error("Oprava neexistuje.");
    assertRepairTransition(current.state, next);
    await tx.repairCase.update({ where: { id }, data: { state: next as typeof current.state } });
    await tx.repairEvent.create({ data: { repairCaseId: id, previousState: current.state, newState: next as typeof current.state, userId: user.id, note: value(form, "note") } });
    await tx.auditLog.create({ data: { userId: user.id, action: `REPAIR_${next}`, entityType: "RepairCase", entityId: id, previousValue: { state: current.state }, newValue: { state: next } } });
  }, transactionOptions);
  revalidatePath("/zavady");
}

export async function confirmOperationalEvent(form: FormData) {
  const reader = await requireOperationalPermission("protocol:read");
  const id = value(form, "id");
  const current = await prisma.operationalProtocol.findFirst({ where: { id, organizationId: reader.organizationId } });
  if (!current) throw new Error("Dokument neexistuje.");
  const user = await requireOperationalPermission(current.type === "HANDOVER" ? "handover:confirm" : "equipment:out_of_service");
  if (current.type === "REPAIR_PROPOSAL") throw new Error("Návrh opravy není skutečnou provozní událostí.");
  if (form.get("confirmed") !== "on") throw new Error("Potvrďte skutečné provedení události.");
  const eventDate = parseDateOnly(form.get("eventDate"), "Datum události");
  if (dateKey(eventDate) > todayDateKey()) throw new Error("Budoucí událost nelze potvrdit.");
  await prisma.$transaction(async tx => {
    const doc = await tx.operationalProtocol.findFirst({ where: { id, organizationId: user.organizationId, status: "ISSUED" }, include: { items: true } });
    if (!doc) throw new Error("Potvrdit lze pouze vystavený dokument.");
    const already = await tx.auditLog.findFirst({ where: { entityType: "OperationalProtocol", entityId: id, action: doc.type === "HANDOVER" ? "HANDOVER_CONFIRMED" : "EQUIPMENT_OUT_OF_SERVICE" } });
    if (already) return;
    const data = doc.draftData as Record<string, string>;
    for (const item of doc.items) {
      const equipment = await tx.equipmentItem.findFirst({ where: { id: item.equipmentId, organizationId: user.organizationId } });
      if (!equipment) throw new Error("Prostředek není dostupný.");
      if (doc.type === "HANDOVER") {
        if (await tx.handoverMovement.findFirst({ where: { equipmentId: item.equipmentId, returnedAt: null } })) throw new Error("Prostředek je již v aktivním předání.");
        await tx.handoverMovement.create({ data: { itemId: item.id, equipmentId: item.equipmentId, handedOverAt: eventDate, handedOverById: user.id, expectedReturnAt: data.expectedReturn ? parseDateOnly(data.expectedReturn, "Vrácení do") : null } });
        if (!["SERVICE", "LOAN"].includes(data.handoverPurpose)) throw new Error("Vyberte předání do servisu nebo zápůjčku.");
        await tx.equipmentItem.update({ where: { id: equipment.id }, data: { status: data.handoverPurpose === "SERVICE" ? "IN_REPAIR" : "LOANED" } });
      } else {
        await tx.equipmentItem.update({ where: { id: equipment.id }, data: { status: "OUT_OF_SERVICE", complianceStatus: "OVERDUE_BLOCKED" } });
        const existing = await tx.defect.findFirst({ where: { equipmentId: equipment.id, closedAt: null, ...(doc.relatedInspectionId ? { inspectionId: doc.relatedInspectionId } : {}) } });
        if (!existing) await tx.defect.create({ data: { equipmentId: equipment.id, inspectionId: doc.relatedInspectionId, reportedById: user.id, description: data.description || data.reason, severity: "SIGNIFICANT" } });
      }
      await tx.equipmentLogEntry.create({ data: { equipmentId: equipment.id, eventType: "OTHER", occurredAt: eventDate, description: `${doc.title} ${doc.number}: ${data.reason}`, createdById: user.id } });
    }
    await tx.auditLog.create({ data: { userId: user.id, action: doc.type === "HANDOVER" ? "HANDOVER_CONFIRMED" : "EQUIPMENT_OUT_OF_SERVICE", entityType: "OperationalProtocol", entityId: id, newValue: { eventDate: eventDate.toISOString() } } });
  }, transactionOptions);
  revalidatePath(`/protokoly/provozni/${id}`); revalidatePath("/prostredky");
}

export async function returnHandoverItem(form: FormData) {
  const user = await requireOperationalPermission("handover:return");
  const movementId = value(form, "movementId");
  const returnedAt = parseDateOnly(form.get("returnedAt"), "Datum vrácení");
  if (dateKey(returnedAt) > todayDateKey()) throw new Error("Vrácení nesmí být v budoucnosti.");
  await prisma.$transaction(async tx => {
    const movement = await tx.handoverMovement.findUnique({ where: { id: movementId }, include: { item: { include: { protocol: true } } } });
    if (!movement || movement.item.protocol.organizationId !== user.organizationId) throw new Error("Předání není dostupné.");
    if (movement.returnedAt) return;
    if (returnedAt < movement.handedOverAt) throw new Error("Vrácení nesmí předcházet předání.");
    const returnData = { condition: value(form, "condition"), accessories: value(form, "accessories"), defects: value(form, "defects"), note: value(form, "note") };
    if (!returnData.condition) throw new Error("Stav při vrácení je povinný.");
    await tx.handoverMovement.update({ where: { id: movementId }, data: { returnedAt, returnedById: user.id, returnData } });
    await tx.equipmentItem.update({ where: { id: movement.equipmentId }, data: { status: "AWAITING_INSPECTION" } });
    await tx.auditLog.create({ data: { userId: user.id, action: "EQUIPMENT_RETURNED", entityType: "EquipmentItem", entityId: movement.equipmentId, newValue: { movementId, returnedAt: returnedAt.toISOString(), ...returnData } } });
  }, transactionOptions);
  revalidatePath("/protokoly"); revalidatePath("/prostredky");
}

export async function submitRepairProposal(form: FormData) {
  const user = await requireOperationalPermission("repair:create");
  const id = value(form, "id");
  await prisma.$transaction(async tx => {
    const doc = await tx.operationalProtocol.findFirst({ where: { id, organizationId: user.organizationId, type: "REPAIR_PROPOSAL", status: "ISSUED" }, include: { items: true } });
    if (!doc || doc.items.length !== 1) throw new Error("Nejprve vystavte návrh pro jeden prostředek.");
    if (await tx.auditLog.findFirst({ where: { action: "REPAIR_SUBMITTED", entityType: "OperationalProtocol", entityId: id } })) return;
    const data = doc.draftData as Record<string, string>;
    if (!data.description || !data.solution || !data.justification) throw new Error("Doplňte popis závady, navrhovanou opravu a odůvodnění před vystavením.");
    const equipmentId = doc.items[0].equipmentId;
    let defect = await tx.defect.findFirst({ where: { equipmentId, closedAt: null }, orderBy: { foundAt: "desc" } });
    if (!defect) defect = await tx.defect.create({ data: { equipmentId, reportedById: user.id, description: data.description, severity: "SIGNIFICANT" } });
    const existing = await tx.repairCase.findUnique({ where: { defectId: defect.id } });
    if (existing && !["PROPOSAL_REQUIRED", "CHANGES_REQUIRED", "REJECTED"].includes(existing.state)) throw new Error("Závada už má aktivní návrh nebo opravu.");
    const estimate = data.estimatedCost ? new Prisma.Decimal(data.estimatedCost) : null;
    if (estimate?.isNegative()) throw new Error("Předpokládaná cena nesmí být záporná.");
    const repair = existing
      ? await tx.repairCase.update({ where: { id: existing.id }, data: { state: "PENDING_APPROVAL", estimatedCost: estimate } })
      : await tx.repairCase.create({ data: { organizationId: user.organizationId, equipmentId, defectId: defect.id, state: "PENDING_APPROVAL", responsibleUserId: user.id, estimatedCost: estimate, currency: data.currency || "CZK", dueAt: data.dueDate ? parseDateOnly(data.dueDate, "Termín opravy") : null } });
    // The association is stored separately: issued document contents stay immutable.
    await tx.repairEvent.create({ data: { repairCaseId: repair.id, previousState: existing?.state, newState: "PENDING_APPROVAL", userId: user.id, data: { protocolId: id }, note: "Návrh odeslán ke schválení" } });
    await tx.auditLog.create({ data: { userId: user.id, action: "REPAIR_SUBMITTED", entityType: "OperationalProtocol", entityId: id, newValue: { repairCaseId: repair.id } } });
  }, transactionOptions);
  revalidatePath(`/protokoly/provozni/${id}`); revalidatePath("/zavady");
}
