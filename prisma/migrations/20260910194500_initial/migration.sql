-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EquipmentStatus" AS ENUM ('IN_SERVICE', 'OUT_OF_SERVICE', 'IN_REPAIR', 'AWAITING_INSPECTION', 'AWAITING_REVISION', 'LOANED', 'IN_STOCK', 'RETIRED', 'LOST');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('COMPLIANT', 'WARNING', 'DUE_SOON', 'OVERDUE_BLOCKED', 'UNDEFINED');

-- CreateEnum
CREATE TYPE "EvidenceMode" AS ENUM ('INDIVIDUAL', 'QUANTITY');

-- CreateEnum
CREATE TYPE "RequirementType" AS ENUM ('INSPECTION', 'REVISION', 'CALIBRATION', 'VERIFICATION', 'LIFETIME', 'EXPIRATION');

-- CreateEnum
CREATE TYPE "RuleSourceType" AS ENUM ('LEGAL_REGULATION', 'TECHNICAL_SERVICE_ORDER', 'MANUFACTURER', 'INTERNAL_CEPRO', 'LOCAL_MSTETICE', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "IntervalUnit" AS ENUM ('DAYS', 'WEEKS', 'MONTHS', 'YEARS');

-- CreateEnum
CREATE TYPE "InspectionLevel" AS ENUM ('USER', 'PROFESSIONAL');

-- CreateEnum
CREATE TYPE "InspectionResult" AS ENUM ('PASSED', 'FAILED', 'PASSED_WITH_LIMITATION');

-- CreateEnum
CREATE TYPE "InspectionState" AS ENUM ('DRAFT', 'CLOSED', 'CANCELLED', 'CORRECTED');

-- CreateEnum
CREATE TYPE "DefectSeverity" AS ENUM ('MINOR', 'SIGNIFICANT', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ServiceCaseStatus" AS ENUM ('NEW', 'ASSESSED', 'OUT_OF_SERVICE', 'WAITING_FOR_REPAIR', 'IN_REPAIR', 'REPAIRED', 'POST_REPAIR_INSPECTION', 'CLOSED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('NORMAL', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Station" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "parentId" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "callSign" TEXT,
    "registrationPlate" TEXT,
    "stationId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "Qualification" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Qualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserQualification" (
    "userId" TEXT NOT NULL,
    "qualificationId" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3),

    CONSTRAINT "UserQualification_pkey" PRIMARY KEY ("userId","qualificationId")
);

-- CreateTable
CREATE TABLE "EquipmentCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "individualEvidenceRequired" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "EquipmentCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentItem" (
    "id" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "evidenceMode" "EvidenceMode" NOT NULL DEFAULT 'INDIVIDUAL',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "minimumQuantity" INTEGER,
    "categoryId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "locationId" TEXT,
    "vehicleId" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "typeName" TEXT,
    "serialNumber" TEXT,
    "registrationNumber" TEXT,
    "internalId" TEXT,
    "manufacturedAt" TIMESTAMP(3),
    "manufacturedYear" INTEGER,
    "acquiredAt" TIMESTAMP(3),
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "warrantyUntil" TIMESTAMP(3),
    "declaredLifetimeMonths" INTEGER,
    "lifetimeUntil" TIMESTAMP(3),
    "purchasePrice" DECIMAL(12,2),
    "supplier" TEXT,
    "status" "EquipmentStatus" NOT NULL DEFAULT 'IN_STOCK',
    "complianceStatus" "ComplianceStatus" NOT NULL DEFAULT 'UNDEFINED',
    "note" TEXT,
    "parentSetId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "EquipmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentStatusHistory" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "fromStatus" "EquipmentStatus",
    "toStatus" "EquipmentStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentLocationHistory" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "fromVehicleId" TEXT,
    "toVehicleId" TEXT,
    "reason" TEXT,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentLocationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "documentNumber" TEXT,
    "sourceType" "RuleSourceType" NOT NULL,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requirementType" "RequirementType" NOT NULL,
    "sourceType" "RuleSourceType" NOT NULL,
    "sourceDocumentId" TEXT,
    "categoryId" TEXT,
    "equipmentId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleVersion" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "article" TEXT,
    "paragraph" TEXT,
    "page" TEXT,
    "note" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "intervalValue" INTEGER,
    "intervalUnit" "IntervalUnit",
    "exactDate" TIMESTAMP(3),
    "conditionJson" JSONB,
    "manufacturer" TEXT,
    "model" TEXT,
    "inspectionType" TEXT,
    "checklistTemplateVersionId" TEXT,
    "qualificationId" TEXT,
    "lifetimeLimitMonths" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentRequirement" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "ruleVersionId" TEXT,
    "type" "RequirementType" NOT NULL,
    "name" TEXT NOT NULL,
    "lastCompletedAt" TIMESTAMP(3),
    "nextDueAt" TIMESTAMP(3),
    "status" "ComplianceStatus" NOT NULL DEFAULT 'UNDEFINED',
    "manuallyResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolutionReason" TEXT,

    CONSTRAINT "EquipmentRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),

    CONSTRAINT "ChecklistTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistSection" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "ChecklistSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "responseType" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "failRequiresNote" BOOLEAN NOT NULL DEFAULT false,
    "failRequiresPhoto" BOOLEAN NOT NULL DEFAULT false,
    "failCreatesDefect" BOOLEAN NOT NULL DEFAULT false,
    "unit" TEXT,
    "optionsJson" JSONB,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "inspectorId" TEXT NOT NULL,
    "checklistVersionId" TEXT NOT NULL,
    "inspectionType" TEXT NOT NULL,
    "level" "InspectionLevel" NOT NULL,
    "state" "InspectionState" NOT NULL DEFAULT 'DRAFT',
    "result" "InspectionResult",
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "note" TEXT,
    "snapshot" JSONB,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionResponse" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "checklistItemId" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    "note" TEXT,

    CONSTRAINT "InspectionResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Protocol" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "pdfStorageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "correctionOfId" TEXT,

    CONSTRAINT "Protocol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProtocolRuleSnapshot" (
    "id" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "ruleVersionId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "ProtocolRuleSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Defect" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "inspectionId" TEXT,
    "reportedById" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "DefectSeverity" NOT NULL,
    "foundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locationText" TEXT,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Defect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCase" (
    "id" TEXT NOT NULL,
    "defectId" TEXT NOT NULL,
    "status" "ServiceCaseStatus" NOT NULL DEFAULT 'NEW',
    "assignedToId" TEXT,

    CONSTRAINT "ServiceCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceEvent" (
    "id" TEXT NOT NULL,
    "serviceCaseId" TEXT NOT NULL,
    "status" "ServiceCaseStatus" NOT NULL,
    "description" TEXT NOT NULL,
    "externalCompany" TEXT,
    "partsJson" JSONB,
    "price" DECIMAL(12,2),
    "performedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "equipmentId" TEXT,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_name_key" ON "Organization"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Station_organizationId_name_key" ON "Station"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Location_stationId_parentId_idx" ON "Location"("stationId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Qualification_code_key" ON "Qualification"("code");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentCategory_code_key" ON "EquipmentCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentItem_uid_key" ON "EquipmentItem"("uid");

-- CreateIndex
CREATE INDEX "EquipmentItem_stationId_status_idx" ON "EquipmentItem"("stationId", "status");

-- CreateIndex
CREATE INDEX "EquipmentItem_categoryId_idx" ON "EquipmentItem"("categoryId");

-- CreateIndex
CREATE INDEX "EquipmentItem_serialNumber_idx" ON "EquipmentItem"("serialNumber");

-- CreateIndex
CREATE INDEX "EquipmentStatusHistory_equipmentId_changedAt_idx" ON "EquipmentStatusHistory"("equipmentId", "changedAt");

-- CreateIndex
CREATE INDEX "Rule_categoryId_active_idx" ON "Rule"("categoryId", "active");

-- CreateIndex
CREATE INDEX "RuleVersion_validFrom_validTo_idx" ON "RuleVersion"("validFrom", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "RuleVersion_ruleId_version_key" ON "RuleVersion"("ruleId", "version");

-- CreateIndex
CREATE INDEX "EquipmentRequirement_equipmentId_nextDueAt_idx" ON "EquipmentRequirement"("equipmentId", "nextDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistTemplateVersion_templateId_version_key" ON "ChecklistTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionResponse_inspectionId_checklistItemId_key" ON "InspectionResponse"("inspectionId", "checklistItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Protocol_number_key" ON "Protocol"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Protocol_inspectionId_key" ON "Protocol"("inspectionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProtocolRuleSnapshot_protocolId_ruleVersionId_key" ON "ProtocolRuleSnapshot"("protocolId", "ruleVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCase_defectId_key" ON "ServiceCase"("defectId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "Station" ADD CONSTRAINT "Station_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserQualification" ADD CONSTRAINT "UserQualification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserQualification" ADD CONSTRAINT "UserQualification_qualificationId_fkey" FOREIGN KEY ("qualificationId") REFERENCES "Qualification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentCategory" ADD CONSTRAINT "EquipmentCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "EquipmentCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "EquipmentCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_parentSetId_fkey" FOREIGN KEY ("parentSetId") REFERENCES "EquipmentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentStatusHistory" ADD CONSTRAINT "EquipmentStatusHistory_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "EquipmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLocationHistory" ADD CONSTRAINT "EquipmentLocationHistory_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "EquipmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "EquipmentCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleVersion" ADD CONSTRAINT "RuleVersion_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRequirement" ADD CONSTRAINT "EquipmentRequirement_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "EquipmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRequirement" ADD CONSTRAINT "EquipmentRequirement_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "RuleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplateVersion" ADD CONSTRAINT "ChecklistTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistSection" ADD CONSTRAINT "ChecklistSection_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ChecklistTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ChecklistSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "EquipmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_checklistVersionId_fkey" FOREIGN KEY ("checklistVersionId") REFERENCES "ChecklistTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionResponse" ADD CONSTRAINT "InspectionResponse_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Protocol" ADD CONSTRAINT "Protocol_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProtocolRuleSnapshot" ADD CONSTRAINT "ProtocolRuleSnapshot_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "Protocol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProtocolRuleSnapshot" ADD CONSTRAINT "ProtocolRuleSnapshot_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "RuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "EquipmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCase" ADD CONSTRAINT "ServiceCase_defectId_fkey" FOREIGN KEY ("defectId") REFERENCES "Defect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceEvent" ADD CONSTRAINT "ServiceEvent_serviceCaseId_fkey" FOREIGN KEY ("serviceCaseId") REFERENCES "ServiceCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
