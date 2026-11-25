-- CreateEnum
CREATE TYPE "OperationalProtocolType" AS ENUM ('HANDOVER', 'OUT_OF_SERVICE', 'REPAIR_PROPOSAL');

-- CreateEnum
CREATE TYPE "OperationalProtocolStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RepairWorkflowState" AS ENUM ('DETECTED', 'PROPOSAL_REQUIRED', 'PENDING_APPROVAL', 'CHANGES_REQUIRED', 'APPROVED', 'ORDERED', 'HANDED_OVER', 'IN_REPAIR', 'WAITING_PARTS', 'REPAIR_COMPLETED', 'AWAITING_COLLECTION', 'AWAITING_INSPECTION', 'CLOSED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "UserPermission" (
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("userId","permissionId")
);

-- CreateTable
CREATE TABLE "OperationalProtocol" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT,
    "type" "OperationalProtocolType" NOT NULL,
    "status" "OperationalProtocolStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "protocolDate" TIMESTAMP(3) NOT NULL,
    "eventPlannedAt" TIMESTAMP(3),
    "eventOccurredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancellationReason" TEXT,
    "templateVersion" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "relatedProtocolId" TEXT,
    "relatedInspectionId" TEXT,
    "repairCaseId" TEXT,
    "supplierId" TEXT,
    "draftData" JSONB NOT NULL,
    "snapshot" JSONB,
    "lockVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OperationalProtocol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalProtocolItem" (
    "id" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "details" JSONB NOT NULL,
    "snapshot" JSONB,

    CONSTRAINT "OperationalProtocolItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoverMovement" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "handedOverAt" TIMESTAMP(3) NOT NULL,
    "handedOverById" TEXT NOT NULL,
    "expectedReturnAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "returnedById" TEXT,
    "returnData" JSONB,

    CONSTRAINT "HandoverMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairCase" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "defectId" TEXT NOT NULL,
    "state" "RepairWorkflowState" NOT NULL DEFAULT 'DETECTED',
    "responsibleUserId" TEXT NOT NULL,
    "supplierId" TEXT,
    "dueAt" TIMESTAMP(3),
    "estimatedCost" DECIMAL(14,2),
    "approvedLimit" DECIMAL(14,2),
    "actualCost" DECIMAL(14,2),
    "laborCost" DECIMAL(14,2),
    "partsCost" DECIMAL(14,2),
    "transportCost" DECIMAL(14,2),
    "otherCost" DECIMAL(14,2),
    "vatRate" DECIMAL(5,2),
    "currency" TEXT NOT NULL DEFAULT 'CZK',
    "orderNumber" TEXT,
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "lockVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RepairCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairDecision" (
    "id" TEXT NOT NULL,
    "repairCaseId" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "decidedById" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedLimit" DECIMAL(14,2),
    "reason" TEXT NOT NULL,
    "conditions" TEXT,

    CONSTRAINT "RepairDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairEvent" (
    "id" TEXT NOT NULL,
    "repairCaseId" TEXT NOT NULL,
    "previousState" "RepairWorkflowState",
    "newState" "RepairWorkflowState" NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "data" JSONB,

    CONSTRAINT "RepairEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceSupplier" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" TEXT,
    "taxId" TEXT,
    "address" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "specialization" TEXT,
    "note" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "ServiceSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "OperationalNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OperationalProtocol_number_key" ON "OperationalProtocol"("number");

-- CreateIndex
CREATE INDEX "OperationalProtocol_organizationId_type_status_protocolDate_idx" ON "OperationalProtocol"("organizationId", "type", "status", "protocolDate");

-- CreateIndex
CREATE INDEX "OperationalProtocolItem_equipmentId_idx" ON "OperationalProtocolItem"("equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalProtocolItem_protocolId_equipmentId_key" ON "OperationalProtocolItem"("protocolId", "equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "HandoverMovement_itemId_key" ON "HandoverMovement"("itemId");

-- CreateIndex
CREATE INDEX "HandoverMovement_equipmentId_returnedAt_idx" ON "HandoverMovement"("equipmentId", "returnedAt");

-- CreateIndex
CREATE INDEX "HandoverMovement_expectedReturnAt_returnedAt_idx" ON "HandoverMovement"("expectedReturnAt", "returnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RepairCase_defectId_key" ON "RepairCase"("defectId");

-- CreateIndex
CREATE INDEX "RepairCase_organizationId_state_dueAt_idx" ON "RepairCase"("organizationId", "state", "dueAt");

-- CreateIndex
CREATE INDEX "RepairCase_equipmentId_idx" ON "RepairCase"("equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "RepairDecision_protocolId_key" ON "RepairDecision"("protocolId");

-- CreateIndex
CREATE INDEX "RepairEvent_repairCaseId_createdAt_idx" ON "RepairEvent"("repairCaseId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceSupplier_organizationId_name_idx" ON "ServiceSupplier"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalNotification_deduplicationKey_key" ON "OperationalNotification"("deduplicationKey");

-- CreateIndex
CREATE INDEX "OperationalNotification_userId_readAt_createdAt_idx" ON "OperationalNotification"("userId", "readAt", "createdAt");

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalProtocol" ADD CONSTRAINT "OperationalProtocol_repairCaseId_fkey" FOREIGN KEY ("repairCaseId") REFERENCES "RepairCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalProtocol" ADD CONSTRAINT "OperationalProtocol_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "ServiceSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalProtocolItem" ADD CONSTRAINT "OperationalProtocolItem_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "OperationalProtocol"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverMovement" ADD CONSTRAINT "HandoverMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "OperationalProtocolItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairCase" ADD CONSTRAINT "RepairCase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "ServiceSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairDecision" ADD CONSTRAINT "RepairDecision_repairCaseId_fkey" FOREIGN KEY ("repairCaseId") REFERENCES "RepairCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairDecision" ADD CONSTRAINT "RepairDecision_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "OperationalProtocol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairEvent" ADD CONSTRAINT "RepairEvent_repairCaseId_fkey" FOREIGN KEY ("repairCaseId") REFERENCES "RepairCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "HandoverMovement_one_active_per_equipment"
ON "HandoverMovement" ("equipmentId") WHERE "returnedAt" IS NULL;

ALTER TABLE "OperationalProtocolItem" ADD CONSTRAINT "OperationalProtocolItem_equipmentId_fkey"
FOREIGN KEY ("equipmentId") REFERENCES "EquipmentItem"("id") ON DELETE RESTRICT;
ALTER TABLE "RepairCase" ADD CONSTRAINT "RepairCase_equipmentId_fkey"
FOREIGN KEY ("equipmentId") REFERENCES "EquipmentItem"("id") ON DELETE RESTRICT;
ALTER TABLE "RepairCase" ADD CONSTRAINT "RepairCase_defectId_fkey"
FOREIGN KEY ("defectId") REFERENCES "Defect"("id") ON DELETE RESTRICT;

CREATE FUNCTION protect_operational_document() RETURNS trigger AS $$
BEGIN
  IF OLD."status" <> 'DRAFT' THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Vystavený dokument nelze odstranit'; END IF;
    IF (to_jsonb(NEW) - ARRAY['status','cancelledAt','cancelledById','cancellationReason','updatedAt'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','cancelledAt','cancelledById','cancellationReason','updatedAt']) THEN
      RAISE EXCEPTION 'Vystavený dokument je neměnný';
    END IF;
    IF NEW."status" <> OLD."status" AND NOT (OLD."status" = 'ISSUED' AND NEW."status" = 'CANCELLED') THEN
      RAISE EXCEPTION 'Nepovolená změna stavu dokumentu';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "OperationalProtocol_immutable" BEFORE UPDATE OR DELETE ON "OperationalProtocol"
FOR EACH ROW EXECUTE FUNCTION protect_operational_document();

CREATE FUNCTION protect_repair_decision() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Rozhodnutí o opravě je neměnné'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RepairDecision_immutable" BEFORE UPDATE OR DELETE ON "RepairDecision"
FOR EACH ROW EXECUTE FUNCTION protect_repair_decision();
