import { ModulePage } from "@/components/module-page";
import { OperationalEditorLoader } from "@/components/operational-editor-loader";
import { operationalPageAccess } from "@/lib/operational-authorization";
import { OperationalAccessDenied } from "@/components/operational-access-denied";
import { prisma } from "@/lib/prisma";
import { todayDateKey } from "@/lib/inspection-lifecycle";
import { protocolTypes } from "@/lib/operational-workflow";
import type { OperationalType } from "@/lib/operational-workflow";
import { OperationalProtocolChoices } from "@/components/operational-protocol-choices";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { user, allowed } = await operationalPageAccess("protocol:create");
  if (!allowed)
    return (
      <OperationalAccessDenied
        title="Nový provozní protokol"
        permission="protocol:create"
        user={user}
      />
    );
  const q = await searchParams;
  if (!q.type || !Object.hasOwn(protocolTypes, q.type)) {
    const context = Object.fromEntries(
      Object.entries(q).filter(
        (entry): entry is [string, string] =>
          Boolean(entry[1]) && entry[0] !== "type",
      ),
    );
    return (
      <ModulePage eyebrow="Dokumentace" title="Vyberte protokol">
        <p>
          Každý druh má vlastní formulář, číslo dokumentu a samostatné PDF pro
          tisk.
        </p>
        <OperationalProtocolChoices context={context} />
      </ModulePage>
    );
  }
  const type = q.type as OperationalType;
  const initial: Record<string, string> = {
    sender: user.displayName,
    senderOrganization: "HZS ČEPRO – Mstětice",
    responsibleUserId: user.id,
  };
  let equipmentId = q.equipmentId;
  if (q.inspectionId) {
    const inspection = await prisma.inspection.findFirst({
      where: {
        id: q.inspectionId,
        equipment: { organizationId: user.organizationId },
      },
      include: { defects: true },
    });
    if (inspection) {
      equipmentId = inspection.equipmentId;
      initial.relatedInspectionId = inspection.id;
      initial.description = inspection.defects
        .map((d) => d.description)
        .join("\n");
      initial.relatedDefectId = inspection.defects[0]?.id ?? "";
    }
  }
  if (q.defectId) {
    const defect = await prisma.defect.findFirst({
      where: {
        id: q.defectId,
        equipment: { organizationId: user.organizationId },
      },
    });
    if (defect) {
      equipmentId = defect.equipmentId;
      initial.relatedDefectId = defect.id;
      initial.description = defect.description;
    }
  }
  if (q.protocolId) {
    const doc = await prisma.operationalProtocol.findFirst({
      where: { id: q.protocolId, organizationId: user.organizationId },
      include: { items: true },
    });
    if (doc) {
      Object.assign(initial, doc.draftData);
      initial.relatedProtocolId = doc.id;
      equipmentId = doc.items[0]?.equipmentId;
    }
  }
  if (q.repairCaseId) {
    const repair = await prisma.repairCase.findFirst({
      where: { id: q.repairCaseId, organizationId: user.organizationId },
    });
    if (repair) {
      equipmentId = repair.equipmentId;
      initial.repairCaseId = repair.id;
      initial.relatedDefectId = repair.defectId;
      initial.supplierId = repair.supplierId ?? "";
    }
  }
  return (
    <ModulePage eyebrow="Nový dokument" title={protocolTypes[type]}>
      <p>
        <Link href="/protokoly/novy">Vybrat jiný druh protokolu</Link>
      </p>
      <OperationalEditorLoader
        organizationId={user.organizationId}
        initial={initial}
        initialType={type}
        date={todayDateKey()}
        selectedIds={equipmentId ? [equipmentId] : []}
      />
    </ModulePage>
  );
}
