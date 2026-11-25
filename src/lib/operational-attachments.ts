import "server-only";
import { prisma } from "@/lib/prisma";
export async function authorizeAttachmentOwner(
  organizationId: string,
  ownerType: string,
  ownerId: string,
) {
  const root = ownerType.split(":")[0];
  if (root === "OperationalProtocol" || root === "OperationalFollowup") {
    return Boolean(
      await prisma.operationalProtocol.findFirst({
        where: { id: ownerId, organizationId },
      }),
    );
  }
  if (root === "RepairCase")
    return Boolean(
      await prisma.repairCase.findFirst({
        where: { id: ownerId, organizationId },
      }),
    );
  return false;
}
