ALTER TABLE "EquipmentItem" ADD COLUMN "needsReview" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "EquipmentRequirement"
  ADD COLUMN "intervalValue" INTEGER,
  ADD COLUMN "intervalUnit" "IntervalUnit",
  ADD COLUMN "source" TEXT,
  ADD COLUMN "sourceType" "RuleSourceType",
  ADD COLUMN "sourceRuleId" TEXT,
  ADD COLUMN "note" TEXT,
  ADD COLUMN "needsReview" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "EquipmentRequirementHistory" (
  "id" TEXT NOT NULL,
  "requirementId" TEXT NOT NULL,
  "lastCompletedAt" TIMESTAMP(3),
  "nextDueAt" TIMESTAMP(3),
  "intervalValue" INTEGER,
  "intervalUnit" "IntervalUnit",
  "status" "ComplianceStatus" NOT NULL,
  "note" TEXT,
  "source" TEXT,
  "recordedById" TEXT,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquipmentRequirementHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EquipmentItem_needsReview_idx" ON "EquipmentItem"("needsReview");
CREATE INDEX "EquipmentRequirement_sourceRuleId_idx" ON "EquipmentRequirement"("sourceRuleId");
CREATE INDEX "EquipmentRequirementHistory_requirementId_recordedAt_idx" ON "EquipmentRequirementHistory"("requirementId", "recordedAt");

ALTER TABLE "EquipmentRequirement" ADD CONSTRAINT "EquipmentRequirement_sourceRuleId_fkey" FOREIGN KEY ("sourceRuleId") REFERENCES "Rule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EquipmentRequirementHistory" ADD CONSTRAINT "EquipmentRequirementHistory_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "EquipmentRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "EquipmentRequirement" er
SET
  "intervalValue" = rv."intervalValue",
  "intervalUnit" = rv."intervalUnit",
  "sourceRuleId" = rv."ruleId",
  "source" = sd."title",
  "sourceType" = r."sourceType"
FROM "RuleVersion" rv
JOIN "Rule" r ON r."id" = rv."ruleId"
LEFT JOIN "SourceDocument" sd ON sd."id" = r."sourceDocumentId"
WHERE er."ruleVersionId" = rv."id";
