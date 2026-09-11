ALTER TYPE "IntervalUnit" ADD VALUE 'OPERATING_HOURS';
ALTER TYPE "IntervalUnit" ADD VALUE 'USAGE_COUNT';
ALTER TYPE "EquipmentStatus" ADD VALUE 'WINTERIZED';

CREATE TYPE "RequirementTrigger" AS ENUM (
  'PERIODIC', 'BEFORE_COMMISSIONING', 'BEFORE_USE', 'AFTER_USE',
  'AFTER_UNUSUAL_USE', 'AFTER_REPAIR', 'AFTER_REVISION', 'SHIFT_HANDOVER',
  'ON_DOUBT', 'ON_BROKEN_SEAL'
);

ALTER TABLE "SourceDocument" ADD COLUMN "version" TEXT, ADD COLUMN "issuer" TEXT;
ALTER TABLE "Rule" ADD COLUMN "targetKey" TEXT, ADD COLUMN "targetLabel" TEXT;
CREATE INDEX "Rule_targetKey_active_idx" ON "Rule"("targetKey", "active");

ALTER TABLE "RuleVersion"
  ADD COLUMN "trigger" "RequirementTrigger" NOT NULL DEFAULT 'PERIODIC',
  ADD COLUMN "performedBy" TEXT;

ALTER TABLE "EquipmentItem"
  ADD COLUMN "currentOperatingHours" DECIMAL(12,2),
  ADD COLUMN "operatingHoursReadAt" TIMESTAMP(3),
  ADD COLUMN "usageCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "commissionedAt" TIMESTAMP(3),
  ADD COLUMN "passportReference" TEXT;

ALTER TABLE "EquipmentRequirement"
  ADD COLUMN "trigger" "RequirementTrigger" NOT NULL DEFAULT 'PERIODIC',
  ADD COLUMN "performedBy" TEXT,
  ADD COLUMN "nextOperatingHours" DECIMAL(12,2),
  ADD COLUMN "nextUsageCount" INTEGER;

ALTER TABLE "ChecklistItem"
  ADD COLUMN "allowNotApplicable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "naRequiresReason" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Inspection"
  ADD COLUMN "requirementId" TEXT,
  ADD COLUMN "correctionOfId" TEXT,
  ADD COLUMN "correctionReason" TEXT;

ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_requirementId_fkey"
  FOREIGN KEY ("requirementId") REFERENCES "EquipmentRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_correctionOfId_fkey"
  FOREIGN KEY ("correctionOfId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Inspection_requirementId_completedAt_idx" ON "Inspection"("requirementId", "completedAt");
CREATE INDEX "Protocol_correctionOfId_idx" ON "Protocol"("correctionOfId");
ALTER TABLE "Protocol" ADD CONSTRAINT "Protocol_correctionOfId_fkey"
  FOREIGN KEY ("correctionOfId") REFERENCES "Protocol"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "EquipmentMeterReading" (
  "id" TEXT NOT NULL,
  "equipmentId" TEXT NOT NULL,
  "operatingHours" DECIMAL(12,2) NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL,
  "recordedById" TEXT NOT NULL,
  "note" TEXT,
  CONSTRAINT "EquipmentMeterReading_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EquipmentMeterReading_equipmentId_readAt_idx" ON "EquipmentMeterReading"("equipmentId", "readAt");
ALTER TABLE "EquipmentMeterReading" ADD CONSTRAINT "EquipmentMeterReading_equipmentId_fkey"
  FOREIGN KEY ("equipmentId") REFERENCES "EquipmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EquipmentMeterReading" ADD CONSTRAINT "EquipmentMeterReading_recordedById_fkey"
  FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "EquipmentOperatingLog" (
  "id" TEXT NOT NULL,
  "equipmentId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "operatingHours" DECIMAL(12,2) NOT NULL,
  "hoursDelta" DECIMAL(12,2) NOT NULL,
  "userId" TEXT NOT NULL,
  "note" TEXT,
  "linkedInspectionId" TEXT,
  "linkedServiceEventId" TEXT,
  CONSTRAINT "EquipmentOperatingLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EquipmentOperatingLog_equipmentId_date_idx" ON "EquipmentOperatingLog"("equipmentId", "date");
ALTER TABLE "EquipmentOperatingLog" ADD CONSTRAINT "EquipmentOperatingLog_equipmentId_fkey"
  FOREIGN KEY ("equipmentId") REFERENCES "EquipmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EquipmentOperatingLog" ADD CONSTRAINT "EquipmentOperatingLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EquipmentOperatingLog" ADD CONSTRAINT "EquipmentOperatingLog_linkedInspectionId_fkey"
  FOREIGN KEY ("linkedInspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EquipmentOperatingLog" ADD CONSTRAINT "EquipmentOperatingLog_linkedServiceEventId_fkey"
  FOREIGN KEY ("linkedServiceEventId") REFERENCES "ServiceEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Uzavřený záznam se neopravuje přepsáním. Povolena je jen změna stavu
-- (storno/opravný záznam vzniká jako nový Inspection s vazbou correctionOfId).
CREATE FUNCTION prevent_closed_inspection_rewrite() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."state" IN ('CLOSED', 'CANCELLED', 'CORRECTED') THEN
      RAISE EXCEPTION 'Uzavřenou kontrolu nelze odstranit';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."state" IN ('CLOSED', 'CANCELLED', 'CORRECTED') THEN
    IF (to_jsonb(NEW) - ARRAY['state','correctionReason']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state','correctionReason']) THEN
      RAISE EXCEPTION 'Uzavřenou kontrolu nelze přepsat; vytvořte storno nebo opravný záznam';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Inspection_immutable_when_closed"
  BEFORE UPDATE OR DELETE ON "Inspection"
  FOR EACH ROW EXECUTE FUNCTION prevent_closed_inspection_rewrite();

CREATE FUNCTION prevent_protocol_snapshot_rewrite() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Protokol nelze odstranit'; END IF;
  IF NEW."snapshot" IS DISTINCT FROM OLD."snapshot"
     OR NEW."number" IS DISTINCT FROM OLD."number"
     OR NEW."inspectionId" IS DISTINCT FROM OLD."inspectionId"
     OR NEW."equipmentId" IS DISTINCT FROM OLD."equipmentId" THEN
    RAISE EXCEPTION 'Obsah protokolu je neměnný; použijte storno nebo opravný protokol';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Protocol_snapshot_immutable"
  BEFORE UPDATE OR DELETE ON "Protocol"
  FOR EACH ROW EXECUTE FUNCTION prevent_protocol_snapshot_rewrite();
