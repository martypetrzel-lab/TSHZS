ALTER TYPE "RuleSourceType" ADD VALUE 'LEGACY_IMPORT';

CREATE TYPE "ImportJobStatus" AS ENUM ('PREVIEW_READY', 'DRY_RUN_READY', 'RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "ImportRowStatus" AS ENUM ('NEW', 'UPDATE', 'SKIP', 'WARNING', 'ERROR', 'IMPORTED');

ALTER TABLE "EquipmentItem"
  ADD COLUMN "legacyId" TEXT,
  ADD COLUMN "legacyProtocolReference" TEXT,
  ADD COLUMN "importedAt" TIMESTAMP(3),
  ADD COLUMN "importJobId" TEXT;

ALTER TABLE "Protocol"
  ALTER COLUMN "inspectionId" DROP NOT NULL,
  ADD COLUMN "equipmentId" TEXT,
  ADD COLUMN "externalUrl" TEXT,
  ADD COLUMN "legacyImported" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "importJobId" TEXT;

CREATE TABLE "ImportJob" (
  "id" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "sizeBytes" BIGINT NOT NULL,
  "storageKey" TEXT,
  "status" "ImportJobStatus" NOT NULL DEFAULT 'PREVIEW_READY',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "uploadedById" TEXT NOT NULL,
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "createdRows" INTEGER NOT NULL DEFAULT 0,
  "updatedRows" INTEGER NOT NULL DEFAULT 0,
  "skippedRows" INTEGER NOT NULL DEFAULT 0,
  "warningRows" INTEGER NOT NULL DEFAULT 0,
  "errorRows" INTEGER NOT NULL DEFAULT 0,
  "summaryJson" JSONB,
  "mappingJson" JSONB,
  CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportRow" (
  "id" TEXT NOT NULL,
  "importJobId" TEXT NOT NULL,
  "sheetName" TEXT NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "uid" TEXT,
  "action" TEXT NOT NULL,
  "status" "ImportRowStatus" NOT NULL,
  "message" TEXT,
  "rawData" JSONB NOT NULL,
  "previewData" JSONB,
  "resultEntityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EquipmentItem_legacyId_idx" ON "EquipmentItem"("legacyId");
CREATE INDEX "EquipmentItem_importJobId_idx" ON "EquipmentItem"("importJobId");
CREATE INDEX "Protocol_equipmentId_createdAt_idx" ON "Protocol"("equipmentId", "createdAt");
CREATE INDEX "Protocol_importJobId_idx" ON "Protocol"("importJobId");
CREATE INDEX "ImportJob_uploadedById_startedAt_idx" ON "ImportJob"("uploadedById", "startedAt");
CREATE UNIQUE INDEX "ImportRow_importJobId_sheetName_rowNumber_key" ON "ImportRow"("importJobId", "sheetName", "rowNumber");
CREATE INDEX "ImportRow_importJobId_status_idx" ON "ImportRow"("importJobId", "status");
CREATE INDEX "ImportRow_uid_idx" ON "ImportRow"("uid");

ALTER TABLE "Protocol" ADD CONSTRAINT "Protocol_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "EquipmentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
