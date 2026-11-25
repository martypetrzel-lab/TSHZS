import { prisma } from "@/lib/prisma";
import { OperationalEditor } from "@/components/operational-editor";
export async function OperationalEditorLoader({
  organizationId,
  ...props
}: {
  organizationId: string;
  initial: Record<string, string>;
  docId?: string;
  initialType: string;
  date: string;
  selectedIds: string[];
  itemDetails?: Record<string, Record<string, string>>;
  canIssue?: boolean;
}) {
  const [equipment, users, suppliers, vehicles, locations, movements] =
    await Promise.all([
      prisma.equipmentItem.findMany({
        where: { organizationId, archivedAt: null },
        include: { vehicle: true, location: true },
        orderBy: { name: "asc" },
      }),
      prisma.user.findMany({
        where: { organizationId, active: true },
        select: { id: true, displayName: true },
      }),
      prisma.serviceSupplier.findMany({
        where: { organizationId, archivedAt: null },
        orderBy: { name: "asc" },
      }),
      prisma.vehicle.findMany({
        where: { station: { organizationId }, archivedAt: null },
      }),
      prisma.location.findMany({
        where: { station: { organizationId }, archivedAt: null },
      }),
      prisma.handoverMovement.findMany({
        where: { returnedAt: null, item: { protocol: { organizationId } } },
        select: { equipmentId: true },
      }),
    ]);
  return (
    <OperationalEditor
      {...props}
      users={users.map((u) => ({ id: u.id, name: u.displayName }))}
      suppliers={suppliers}
      vehicles={vehicles}
      locations={locations}
      equipment={equipment.map((e) => ({
        id: e.id,
        name: e.name,
        uid: e.uid,
        serialNumber: e.serialNumber,
        registrationNumber: e.registrationNumber,
        legacyId: e.legacyId,
        manufacturer: e.manufacturer,
        model: e.model,
        quantity: e.quantity,
        vehicle: e.vehicle?.name ?? "",
        location: e.location?.name ?? "",
        activeHandover: movements.some((m) => m.equipmentId === e.id),
      }))}
    />
  );
}
