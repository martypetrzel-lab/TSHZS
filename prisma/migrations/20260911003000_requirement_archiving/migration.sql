ALTER TABLE "EquipmentRequirement" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE INDEX "EquipmentRequirement_equipmentId_archivedAt_idx" ON "EquipmentRequirement"("equipmentId", "archivedAt");
