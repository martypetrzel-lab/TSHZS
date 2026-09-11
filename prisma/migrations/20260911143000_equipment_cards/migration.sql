CREATE TYPE "EquipmentLogEventType" AS ENUM ('DEPLOYMENT','TRAINING','INSPECTION','DEFECT','REPAIR','SERVICE','REVISION','TRANSFER','OTHER');

ALTER TABLE "EquipmentItem"
  ADD COLUMN "legacyIdentificationNumber" TEXT,
  ADD COLUMN "material" TEXT,
  ADD COLUMN "manufacturingText" TEXT,
  ADD COLUMN "commissioningText" TEXT,
  ADD COLUMN "technicalDescription" TEXT,
  ADD COLUMN "assignedUserId" TEXT,
  ADD COLUMN "assignedPersonText" TEXT;
CREATE INDEX "EquipmentItem_legacyIdentificationNumber_idx" ON "EquipmentItem"("legacyIdentificationNumber");
CREATE INDEX "EquipmentItem_assignedUserId_idx" ON "EquipmentItem"("assignedUserId");
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "EquipmentSpecification" (
  "id" TEXT NOT NULL, "equipmentId" TEXT NOT NULL, "name" TEXT NOT NULL, "value" TEXT NOT NULL,
  "unit" TEXT, "sortOrder" INTEGER NOT NULL DEFAULT 0, "source" TEXT, "sourceFile" TEXT,
  "sourceSheet" TEXT, "sourceRow" INTEGER, "importJobId" TEXT,
  CONSTRAINT "EquipmentSpecification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EquipmentSpecification_equipmentId_sortOrder_idx" ON "EquipmentSpecification"("equipmentId","sortOrder");
CREATE UNIQUE INDEX "EquipmentSpecification_importJobId_sourceSheet_sourceRow_name_key" ON "EquipmentSpecification"("importJobId","sourceSheet","sourceRow","name");
ALTER TABLE "EquipmentSpecification" ADD CONSTRAINT "EquipmentSpecification_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "EquipmentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "EquipmentLogEntry" (
  "id" TEXT NOT NULL, "equipmentId" TEXT NOT NULL, "eventType" "EquipmentLogEventType" NOT NULL DEFAULT 'OTHER',
  "occurredAt" TIMESTAMP(3), "locationText" TEXT, "durationMinutes" INTEGER, "description" TEXT,
  "defectDescription" TEXT, "remedyDescription" TEXT, "note" TEXT, "legacySignatureText" TEXT,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" TEXT, "legacyImported" BOOLEAN NOT NULL DEFAULT false, "sourceFile" TEXT,
  "sourceSheet" TEXT, "sourceRow" INTEGER, "importJobId" TEXT,
  CONSTRAINT "EquipmentLogEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EquipmentLogEntry_equipmentId_occurredAt_idx" ON "EquipmentLogEntry"("equipmentId","occurredAt");
CREATE UNIQUE INDEX "EquipmentLogEntry_importJobId_sourceSheet_sourceRow_key" ON "EquipmentLogEntry"("importJobId","sourceSheet","sourceRow");
ALTER TABLE "EquipmentLogEntry" ADD CONSTRAINT "EquipmentLogEntry_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "EquipmentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EquipmentLogEntry" ADD CONSTRAINT "EquipmentLogEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ImportedFieldValue" (
  "id" TEXT NOT NULL, "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL, "fieldName" TEXT NOT NULL,
  "valueText" TEXT, "sourceFile" TEXT NOT NULL, "sourceSheet" TEXT NOT NULL, "sourceRow" INTEGER NOT NULL,
  "importJobId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImportedFieldValue_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ImportedFieldValue_entityType_entityId_idx" ON "ImportedFieldValue"("entityType","entityId");
CREATE UNIQUE INDEX "ImportedFieldValue_importJobId_sourceSheet_sourceRow_fieldName_key" ON "ImportedFieldValue"("importJobId","sourceSheet","sourceRow","fieldName");
