export function reminderOffset(deadline, now, intervals) {
  const day = (value) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Prague",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value);
  const remaining = Math.round(
    (Date.parse(day(deadline)) - Date.parse(day(now))) / 86400000,
  );
  return remaining < 0
    ? "overdue"
    : intervals.includes(remaining)
      ? String(remaining)
      : null;
}

export async function generateOperationalReminders(db, now = new Date()) {
  const setting = await db.systemSetting.findUnique({
    where: { key: "operational.reminderDays" },
  });
  const intervals = Array.isArray(setting?.value)
    ? setting.value.filter((n) => Number.isInteger(n) && n >= 0)
    : [30, 14, 7, 3, 1, 0];
  const users = await db.user.findMany({
    where: { active: true },
    include: {
      directPermissions: { include: { permission: true } },
      roles: {
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
        },
      },
    },
  });
  let created = 0;
  for (const user of users) {
    const codes = new Set([
      ...user.directPermissions.map((p) => p.permission.code),
      ...user.roles.flatMap((r) =>
        r.role.permissions.map((p) => p.permission.code),
      ),
    ]);
    if (
      !codes.has("protocol:read") &&
      !codes.has("repair:manage") &&
      !codes.has("repair:approve")
    )
      continue;
    const alerts = [];
    const deadlines = await db.equipmentRequirement.findMany({
      where: {
        archivedAt: null,
        nextDueAt: { not: null },
        equipment: { organizationId: user.organizationId, archivedAt: null },
      },
      include: { equipment: true },
    });
    for (const item of deadlines) {
      const offset = reminderOffset(item.nextDueAt, now, intervals);
      if (offset !== null)
        alerts.push({
          key: `requirement:${item.id}:${item.nextDueAt.toISOString()}:${offset}`,
          type: "REQUIREMENT_DUE",
          title: `${item.type === "REVISION" ? "Revize" : "Kontrola"} ${offset === "overdue" ? "po termínu" : "se blíží"}: ${item.equipment.name}`,
          href: `/prostredky/${item.equipmentId}`,
        });
    }
    const movements = await db.handoverMovement.findMany({
      where: {
        returnedAt: null,
        expectedReturnAt: { not: null },
        item: { protocol: { organizationId: user.organizationId } },
      },
    });
    for (const item of movements) {
      const offset = reminderOffset(item.expectedReturnAt, now, intervals);
      if (offset !== null)
        alerts.push({
          key: `return:${item.id}:${item.expectedReturnAt.toISOString()}:${offset}`,
          type: "HANDOVER_DUE",
          title:
            offset === "overdue"
              ? "Prostředek nebyl vrácen včas"
              : "Blíží se termín vrácení",
          href: `/protokoly/provozni/${item.itemId ? (await db.operationalProtocolItem.findUnique({ where: { id: item.itemId } }))?.protocolId : ""}`,
        });
    }
    if (codes.has("repair:manage") || codes.has("repair:approve")) {
      const repairs = await db.repairCase.findMany({
        where: {
          organizationId: user.organizationId,
          state: { notIn: ["CLOSED", "CANCELLED", "REJECTED"] },
        },
      });
      for (const repair of repairs) {
        if (repair.dueAt) {
          const offset = reminderOffset(repair.dueAt, now, intervals);
          if (offset !== null)
            alerts.push({
              key: `repair:${repair.id}:${repair.dueAt.toISOString()}:${offset}`,
              type: "REPAIR_DUE",
              title:
                offset === "overdue"
                  ? "Oprava po termínu"
                  : "Blíží se termín opravy",
              href: `/zavady/${repair.id}`,
            });
        }
        if (repair.state === "PENDING_APPROVAL" && codes.has("repair:approve"))
          alerts.push({
            key: `approval:${repair.id}:${repair.updatedAt.toISOString()}`,
            type: "REPAIR_PENDING",
            title: "Návrh opravy čeká na schválení",
            href: `/zavady/${repair.id}`,
          });
        if (repair.state === "AWAITING_INSPECTION")
          alerts.push({
            key: `post-repair:${repair.id}:${repair.updatedAt.toISOString()}`,
            type: "POST_REPAIR_INSPECTION",
            title: "Prostředek čeká na kontrolu po opravě",
            href: `/zavady/${repair.id}`,
          });
      }
    }
    const decisions = await db.repairDecision.findMany({
      where: {
        protocol: { createdById: user.id, organizationId: user.organizationId },
      },
    });
    for (const decision of decisions)
      alerts.push({
        key: `decision:${decision.id}`,
        type: "REPAIR_DECISION",
        title:
          decision.decision === "APPROVED"
            ? "Návrh opravy byl schválen"
            : decision.decision === "REJECTED"
              ? "Návrh opravy byl zamítnut"
              : "Návrh opravy byl vrácen k doplnění",
        href: `/protokoly/provozni/${decision.protocolId}`,
      });
    const critical = await db.defect.findMany({
      where: {
        severity: "CRITICAL",
        closedAt: null,
        equipment: { organizationId: user.organizationId },
      },
      include: { equipment: true },
    });
    for (const defect of critical)
      alerts.push({
        key: `critical:${defect.id}`,
        type: "CRITICAL_DEFECT",
        title: `Kritická závada: ${defect.equipment.name}`,
        href: `/prostredky/${defect.equipmentId}`,
      });
    for (const alert of alerts) {
      const existing = await db.operationalNotification.findUnique({
        where: { deduplicationKey: `${user.id}:${alert.key}` },
      });
      await db.operationalNotification.upsert({
        where: { deduplicationKey: `${user.id}:${alert.key}` },
        create: {
          userId: user.id,
          deduplicationKey: `${user.id}:${alert.key}`,
          type: alert.type,
          title: alert.title,
          href: alert.href,
        },
        update: {},
      });
      if (!existing) created++;
    }
  }
  return created;
}
