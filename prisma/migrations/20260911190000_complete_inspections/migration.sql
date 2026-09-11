ALTER TABLE "ChecklistTemplateVersion"
  ADD COLUMN "allowPassedWithLimitation" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "nonCriticalFailureResult" "InspectionResult" NOT NULL DEFAULT 'FAILED';

ALTER TABLE "ChecklistItem"
  ADD COLUMN "critical" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "conditionJson" JSONB;

ALTER TABLE "Inspection"
  ADD COLUMN "identityVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "limitationReason" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledById" TEXT,
  ADD COLUMN "lockVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Defect" ADD COLUMN "checklistItemId" TEXT;
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_checklistItemId_fkey"
  FOREIGN KEY ("checklistItemId") REFERENCES "ChecklistItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InspectionResponse" ADD CONSTRAINT "InspectionResponse_checklistItemId_fkey"
  FOREIGN KEY ("checklistItemId") REFERENCES "ChecklistItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ProtocolCounter" (
  "key" TEXT NOT NULL,
  "currentValue" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProtocolCounter_pkey" PRIMARY KEY ("key")
);

WITH ranked_drafts AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "inspectorId", "equipmentId", "requirementId"
    ORDER BY "startedAt" DESC, "id" DESC
  ) AS rn
  FROM "Inspection"
  WHERE "state" = 'DRAFT' AND "requirementId" IS NOT NULL
)
UPDATE "Inspection" SET
  "state" = 'CANCELLED',
  "cancelledAt" = CURRENT_TIMESTAMP,
  "correctionReason" = 'Automatické sloučení duplicitních rozpracovaných kontrol při migraci'
WHERE "id" IN (SELECT "id" FROM ranked_drafts WHERE rn > 1);

CREATE UNIQUE INDEX "Inspection_one_active_draft_per_user_requirement"
  ON "Inspection"("inspectorId", "equipmentId", "requirementId")
  WHERE "state" = 'DRAFT' AND "requirementId" IS NOT NULL;

CREATE OR REPLACE FUNCTION prevent_closed_inspection_rewrite() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."state" IN ('CLOSED', 'CANCELLED', 'CORRECTED') THEN
      RAISE EXCEPTION 'Uzavřenou kontrolu nelze odstranit';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."state" IN ('CLOSED', 'CANCELLED', 'CORRECTED') THEN
    IF OLD."snapshot" IS NULL AND NEW."snapshot" IS NOT NULL THEN
      IF (to_jsonb(NEW) - ARRAY['state','correctionReason','cancelledAt','cancelledById','snapshot']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state','correctionReason','cancelledAt','cancelledById','snapshot']) THEN
        RAISE EXCEPTION 'Uzavřenou kontrolu nelze přepsat; vytvořte storno nebo opravný záznam';
      END IF;
    ELSIF (to_jsonb(NEW) - ARRAY['state','correctionReason','cancelledAt','cancelledById']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state','correctionReason','cancelledAt','cancelledById']) THEN
      RAISE EXCEPTION 'Uzavřenou kontrolu nelze přepsat; vytvořte storno nebo opravný záznam';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION prevent_closed_response_rewrite() RETURNS trigger AS $$
DECLARE parent_state "InspectionState";
BEGIN
  SELECT "state" INTO parent_state FROM "Inspection"
    WHERE "id" = COALESCE(NEW."inspectionId", OLD."inspectionId");
  IF parent_state <> 'DRAFT' THEN
    RAISE EXCEPTION 'Odpovědi uzavřené kontroly jsou neměnné';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "InspectionResponse_immutable_when_closed"
  BEFORE INSERT OR UPDATE OR DELETE ON "InspectionResponse"
  FOR EACH ROW EXECUTE FUNCTION prevent_closed_response_rewrite();
