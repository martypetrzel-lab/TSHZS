ALTER TABLE "Location" ADD COLUMN "seedKey" TEXT;
ALTER TABLE "SourceDocument" ADD COLUMN "seedKey" TEXT;
ALTER TABLE "Rule" ADD COLUMN "seedKey" TEXT;
ALTER TABLE "ChecklistTemplate" ADD COLUMN "seedKey" TEXT;

CREATE UNIQUE INDEX "Location_seedKey_key" ON "Location"("seedKey");
CREATE UNIQUE INDEX "SourceDocument_seedKey_key" ON "SourceDocument"("seedKey");
CREATE UNIQUE INDEX "Rule_seedKey_key" ON "Rule"("seedKey");
CREATE UNIQUE INDEX "ChecklistTemplate_seedKey_key" ON "ChecklistTemplate"("seedKey");
