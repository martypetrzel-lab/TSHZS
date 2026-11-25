import "server-only";
import type { Prisma } from "@prisma/client";
import type { OperationalPdfSnapshot } from "@/lib/operational-pdf";
export async function operationalSnapshot(
  tx: Prisma.TransactionClient,
  id: string,
  author: string,
): Promise<OperationalPdfSnapshot> {
  const doc = await tx.operationalProtocol.findUniqueOrThrow({
    where: { id },
    include: { items: true, supplier: true },
  });
  const equipment = await tx.equipmentItem.findMany({
    where: { id: { in: doc.items.map((i) => i.equipmentId) } },
    include: { vehicle: true, location: true },
  });
  const attachments = await tx.attachment.findMany({
    where: {
      ownerId: id,
      ownerType: { startsWith: "OperationalProtocol:" },
      archivedAt: null,
    },
    orderBy: { createdAt: "asc" },
  });
  const data = { ...(doc.draftData as Record<string, string>) };
  data.documentVersion = String(doc.version);
  if (doc.supplier)
    data.serviceOrganization = `${doc.supplier.name}, ${doc.supplier.address ?? ""}, ${doc.supplier.contactName ?? ""}, ${doc.supplier.phone ?? ""}, ${doc.supplier.email ?? ""}`;
  if (data.responsibleUserId)
    data.responsiblePerson =
      (
        await tx.user.findUnique({
          where: { id: data.responsibleUserId },
          select: { displayName: true },
        })
      )?.displayName ?? "Neuvedeno";
  const setting = await tx.systemSetting.findUnique({
    where: { key: "operational.stampEnabled" },
  });
  return {
    type: doc.type,
    title: doc.title,
    number: doc.number,
    protocolDate: doc.protocolDate.toISOString(),
    eventOccurredAt: doc.eventOccurredAt?.toISOString() ?? null,
    author,
    data,
    equipment: equipment.map((e) => ({
      id: e.id,
      name: e.name,
      uid: e.uid,
      serialNumber: e.serialNumber,
      registrationNumber: e.registrationNumber,
      manufacturer: e.manufacturer,
      model: e.model,
      placement: e.vehicle?.name ?? e.location?.name ?? "Neurčeno",
      status: e.status,
    })),
    items: doc.items.map((i) => ({
      equipmentId: i.equipmentId,
      quantity: i.quantity,
      details: i.details,
    })),
    attachments: attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      checksum: a.checksumSha256,
      mimeType: a.mimeType,
    })),
    stampEnabled: setting?.value !== false,
  };
}
