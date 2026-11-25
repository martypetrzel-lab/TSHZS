import "server-only";
import type { Prisma } from "@prisma/client";
export async function assertManualInServiceAllowed(
  tx: Prisma.TransactionClient,
  equipmentId: string,
) {
  const [repairs, defects, movements, blocked] = await Promise.all([
    tx.repairCase.count({
      where: {
        equipmentId,
        state: { notIn: ["CLOSED", "CANCELLED", "REJECTED"] },
      },
    }),
    tx.defect.count({ where: { equipmentId, closedAt: null } }),
    tx.handoverMovement.count({ where: { equipmentId, returnedAt: null } }),
    tx.equipmentRequirement.count({
      where: { equipmentId, archivedAt: null, status: "OVERDUE_BLOCKED" },
    }),
  ]);
  if (repairs || defects || movements || blocked)
    throw new Error(
      "Prostředek má aktivní opravu, závadu, předání nebo blokující povinnost. Návrat do provozu proveďte po ověření podmínek v servisním případu.",
    );
}
