import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "./prisma";
const state = vi.hoisted(() => ({ actorId: "" }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => {
    const { prisma } = await import("./prisma");
    return prisma.user.findUniqueOrThrow({
      where: { id: state.actorId },
      include: {
        roles: { include: { role: true } },
        qualifications: { include: { qualification: true } },
      },
    });
  },
}));
import {
  saveOperationalDraft,
  issueOperationalProtocol,
  confirmOperationalEvent,
  returnHandoverItem,
  submitRepairProposal,
  decideRepairProposal,
  advanceRepair,
  cancelOperationalProtocol,
  deleteOperationalDraft,
  duplicateOperationalProtocol,
} from "@/app/actions/operational-protocols";
import {
  saveRepairCosts,
  returnEquipmentToService,
  closeRepairedDefect,
} from "@/app/actions/repair-management";
import { todayDateKey, parseDateOnly } from "./inspection-lifecycle";
import { generateOperationalReminders } from "../../prisma/operational-reminders.mjs";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
describe.skipIf(!enabled)("provozní workflow – skutečný PostgreSQL", () => {
  let organizationId: string,
    technicianId: string,
    approverId: string,
    equipmentId: string,
    secondEquipmentId: string,
    checklistVersionId: string;
  const form = (data: Record<string, string | string[]>) => {
    const result = new FormData();
    for (const [key, value] of Object.entries(data))
      for (const v of Array.isArray(value) ? value : [value])
        result.append(key, v);
    return result;
  };
  async function redirected(
    action: (form: FormData) => Promise<unknown>,
    data: Record<string, string | string[]>,
  ) {
    try {
      await action(form(data));
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("REDIRECT:"))
        return error.message.split("/").at(-1)!;
      throw error;
    }
    throw new Error("Chybí přesměrování");
  }
  async function document(type: string, equipmentIds = [equipmentId]) {
    return redirected(saveOperationalDraft, {
      type,
      equipmentId: equipmentIds,
      protocolDate: todayDateKey(),
      reason: "Fiktivní integrační ověření",
      description: "Testovací závada",
      solution: "Testovací oprava",
      justification: "Obnovení funkce",
      sender: "Testující technik",
      recipient: "Testovací servis",
      place: "Testovací stanice",
      handoverPurpose: "SERVICE",
      estimatedCost: "100.10",
      currency: "CZK",
    });
  }
  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.pathname !== "/tshzs_test" ||
      process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
    )
      throw new Error(
        "Integrační testy vyžadují oddělenou lokální databázi tshzs_test.",
      );
    const tag = randomUUID();
    const org = await prisma.organization.create({
      data: { name: `TEST ONLY ${tag}` },
    });
    organizationId = org.id;
    const station = await prisma.station.create({
      data: { name: "Testovací stanice", organizationId },
    });
    const category = await prisma.equipmentCategory.create({
      data: { code: tag, name: "Testovací prostředky" },
    });
    const role = await prisma.role.upsert({
      where: { code: "TECHNICIAN" },
      create: { code: "TECHNICIAN", name: "Technik" },
      update: {},
    });
    for (const name of ["Technik", "Schvalující"]) {
      const user = await prisma.user.create({
        data: {
          organizationId,
          username: `${name}-${tag}`,
          displayName: name,
          passwordHash: "$2b$12$test-fixture-not-a-login",
          roles: { create: { roleId: role.id } },
        },
      });
      if (name === "Technik") technicianId = user.id;
      else approverId = user.id;
      for (const code of [
        "protocol:read",
        "protocol:create",
        "protocol:edit_draft",
        "protocol:issue",
        "protocol:cancel",
        "protocol:download",
        "handover:confirm",
        "handover:return",
        "equipment:out_of_service",
        "equipment:return_to_service",
        "repair:create",
        "repair:manage",
        "repair:costs_read",
        "repair:costs_edit",
        ...(name === "Schvalující" ? ["repair:approve"] : []),
      ]) {
        const permission = await prisma.permission.upsert({
          where: { code },
          create: { code, name: code },
          update: {},
        });
        await prisma.userPermission.create({
          data: { userId: user.id, permissionId: permission.id },
        });
      }
    }
    for (const n of [1, 2]) {
      const e = await prisma.equipmentItem.create({
        data: {
          organizationId,
          stationId: station.id,
          categoryId: category.id,
          name: `Fiktivní čerpadlo ${n}`,
          uid: `TEST-${tag}-${n}`,
          status: "IN_SERVICE",
        },
      });
      if (n === 1) equipmentId = e.id;
      else secondEquipmentId = e.id;
    }
    const template = await prisma.checklistTemplate.create({
      data: {
        name: "Testovací checklist",
        versions: { create: { version: 1 } },
      },
      include: { versions: true },
    });
    checklistVersionId = template.versions[0].id;
    state.actorId = technicianId;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  it("draft nemá číslo a jeho náhled nemění prostředek", async () => {
    const id = await document("HANDOVER");
    expect(
      (await prisma.operationalProtocol.findUniqueOrThrow({ where: { id } }))
        .number,
    ).toBeNull();
    expect(
      (
        await prisma.equipmentItem.findUniqueOrThrow({
          where: { id: equipmentId },
        })
      ).status,
    ).toBe("IN_SERVICE");
    await expect(deleteOperationalDraft(form({ id }))).rejects.toThrow(
      "REDIRECT:",
    );
    expect(
      await prisma.operationalProtocol.findUnique({ where: { id } }),
    ).toBeNull();
    expect(
      await prisma.auditLog.count({
        where: { entityId: id, action: "PROTOCOL_DRAFT_DELETED" },
      }),
    ).toBe(1);
  });
  it("vystavení je idempotentní a uzamkne snapshot i položky", async () => {
    const id = await document("HANDOVER");
    await issueOperationalProtocol(form({ id }));
    const first = await prisma.operationalProtocol.findUniqueOrThrow({
      where: { id },
    });
    await issueOperationalProtocol(form({ id }));
    expect(
      (await prisma.operationalProtocol.findUniqueOrThrow({ where: { id } }))
        .number,
    ).toBe(first.number);
    await expect(
      prisma.operationalProtocol.delete({ where: { id } }),
    ).rejects.toThrow();
    await expect(
      prisma.operationalProtocol.update({
        where: { id },
        data: { title: "Přepis" },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.operationalProtocolItem.updateMany({
        where: { protocolId: id },
        data: { quantity: 2 },
      }),
    ).rejects.toThrow();
    await cancelOperationalProtocol(form({ id, reason: "Test storna" }));
    expect(
      (await prisma.operationalProtocol.findUniqueOrThrow({ where: { id } }))
        .status,
    ).toBe("CANCELLED");
    expect(
      (await prisma.operationalProtocol.findUniqueOrThrow({ where: { id } }))
        .number,
    ).toBe(first.number);
  });
  it("souběžné vystavení nevytvoří dvě čísla dokumentu", async () => {
    const id = await document("HANDOVER");
    const results = await Promise.allSettled([
      issueOperationalProtocol(form({ id })),
      issueOperationalProtocol(form({ id })),
    ]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    expect(
      await prisma.auditLog.count({
        where: { entityId: id, action: "PROTOCOL_ISSUED" },
      }),
    ).toBe(1);
  });
  it("předá více prostředků, zabrání duplicitě a postupně je vrátí", async () => {
    const id = await document("HANDOVER", [equipmentId, secondEquipmentId]);
    await issueOperationalProtocol(form({ id }));
    await confirmOperationalEvent(
      form({ id, eventDate: todayDateKey(), confirmed: "on" }),
    );
    await confirmOperationalEvent(
      form({ id, eventDate: todayDateKey(), confirmed: "on" }),
    );
    expect(
      await prisma.handoverMovement.count({
        where: {
          equipmentId: { in: [equipmentId, secondEquipmentId] },
          returnedAt: null,
        },
      }),
    ).toBe(2);
    const other = await document("HANDOVER");
    await issueOperationalProtocol(form({ id: other }));
    await expect(
      confirmOperationalEvent(
        form({ id: other, eventDate: todayDateKey(), confirmed: "on" }),
      ),
    ).rejects.toThrow("aktivním předání");
    const movements = await prisma.handoverMovement.findMany({
      where: { item: { protocolId: id } },
    });
    await returnHandoverItem(
      form({
        movementId: movements[0].id,
        returnedAt: todayDateKey(),
        condition: "Úplné",
      }),
    );
    expect(
      await prisma.handoverMovement.count({
        where: { item: { protocolId: id }, returnedAt: null },
      }),
    ).toBe(1);
    await returnHandoverItem(
      form({
        movementId: movements[1].id,
        returnedAt: todayDateKey(),
        condition: "Úplné",
      }),
    );
    expect(
      await prisma.handoverMovement.count({
        where: { item: { protocolId: id }, returnedAt: null },
      }),
    ).toBe(0);
    expect(
      (
        await prisma.equipmentItem.findUniqueOrThrow({
          where: { id: equipmentId },
        })
      ).status,
    ).toBe("AWAITING_INSPECTION");
  });
  it("odstavení a celý schvalovaný servisní cyklus zachovají historii", async () => {
    const out = await document("OUT_OF_SERVICE");
    await issueOperationalProtocol(form({ id: out }));
    await confirmOperationalEvent(
      form({ id: out, eventDate: todayDateKey(), confirmed: "on" }),
    );
    expect(
      (
        await prisma.equipmentItem.findUniqueOrThrow({
          where: { id: equipmentId },
        })
      ).complianceStatus,
    ).toBe("OVERDUE_BLOCKED");
    const defectCount = await prisma.defect.count({
      where: { equipmentId, closedAt: null },
    });
    await confirmOperationalEvent(
      form({ id: out, eventDate: todayDateKey(), confirmed: "on" }),
    );
    expect(
      await prisma.defect.count({ where: { equipmentId, closedAt: null } }),
    ).toBe(defectCount);
    const proposal = await document("REPAIR_PROPOSAL");
    await issueOperationalProtocol(form({ id: proposal }));
    await submitRepairProposal(form({ id: proposal }));
    await submitRepairProposal(form({ id: proposal }));
    const repair = await prisma.repairCase.findFirstOrThrow({
      where: { equipmentId },
    });
    await expect(
      decideRepairProposal(
        form({
          id: proposal,
          decision: "APPROVED",
          approvedLimit: "100",
          reason: "Souhlas",
        }),
      ),
    ).rejects.toThrow("oprávnění");
    await expect(
      advanceRepair(form({ repairCaseId: repair.id, state: "ORDERED" })),
    ).rejects.toThrow();
    state.actorId = approverId;
    await decideRepairProposal(
      form({
        id: proposal,
        decision: "CHANGES_REQUIRED",
        reason: "Doplňte řešení",
      }),
    );
    state.actorId = technicianId;
    const revision = await redirected(duplicateOperationalProtocol, {
      id: proposal,
    });
    await issueOperationalProtocol(form({ id: revision }));
    await submitRepairProposal(form({ id: revision }));
    state.actorId = approverId;
    await decideRepairProposal(
      form({
        id: revision,
        decision: "APPROVED",
        reason: "Souhlas s opravou",
        approvedLimit: "1000.00",
      }),
    );
    state.actorId = technicianId;
    await advanceRepair(form({ repairCaseId: repair.id, state: "ORDERED" }));
    await advanceRepair(form({ repairCaseId: repair.id, state: "IN_REPAIR" }));
    await saveRepairCosts(
      form({
        repairCaseId: repair.id,
        laborCost: "0.10",
        partsCost: "0.20",
        transportCost: "0",
        otherCost: "0",
        currency: "CZK",
      }),
    );
    expect(
      (
        await prisma.repairCase.findUniqueOrThrow({ where: { id: repair.id } })
      ).actualCost?.toFixed(2),
    ).toBe("0.30");
    await advanceRepair(
      form({ repairCaseId: repair.id, state: "REPAIR_COMPLETED" }),
    );
    await advanceRepair(
      form({ repairCaseId: repair.id, state: "AWAITING_INSPECTION" }),
    );
    await expect(
      returnEquipmentToService(
        form({ repairCaseId: repair.id, inspectionId: "missing" }),
      ),
    ).rejects.toThrow();
    await prisma.attachment.create({
      data: {
        ownerType: "RepairCase:SERVICE_REPORT",
        ownerId: repair.id,
        fileName: "fiktivni-zprava.pdf",
        mimeType: "application/pdf",
        sizeBytes: 5,
        storageKey: `test/${randomUUID()}`,
        checksumSha256: "fictitious-test-checksum",
        uploadedById: technicianId,
      },
    });
    await closeRepairedDefect(
      form({ repairCaseId: repair.id, reason: "Závada odstraněna" }),
    );
    const requirement = await prisma.equipmentRequirement.create({
      data: {
        equipmentId,
        type: "INSPECTION",
        name: "Kontrola po opravě",
        trigger: "AFTER_REPAIR",
        lastCompletedAt: new Date(),
        status: "COMPLIANT",
      },
    });
    const inspection = await prisma.inspection.create({
      data: {
        equipmentId,
        requirementId: requirement.id,
        inspectorId: technicianId,
        checklistVersionId,
        inspectionType: "Kontrola po opravě",
        level: "PROFESSIONAL",
        state: "CLOSED",
        result: "PASSED",
        performedAt: parseDateOnly(todayDateKey(), "Datum"),
        completedAt: new Date(),
      },
    });
    await returnEquipmentToService(
      form({ repairCaseId: repair.id, inspectionId: inspection.id }),
    );
    expect(
      (
        await prisma.equipmentItem.findUniqueOrThrow({
          where: { id: equipmentId },
        })
      ).status,
    ).toBe("IN_SERVICE");
    expect(
      (await prisma.repairCase.findUniqueOrThrow({ where: { id: repair.id } }))
        .state,
    ).toBe("CLOSED");
    expect(
      await prisma.repairEvent.count({ where: { repairCaseId: repair.id } }),
    ).toBeGreaterThan(5);
  });
  it("cron je idempotentní", async () => {
    await generateOperationalReminders(prisma);
    const first = await prisma.operationalNotification.count();
    await generateOperationalReminders(prisma);
    expect(await prisma.operationalNotification.count()).toBe(first);
  });
});
