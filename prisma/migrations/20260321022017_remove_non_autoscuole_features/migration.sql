-- Pre-migration data cleanup (must run before schema changes)
DELETE FROM "CompanyService" WHERE "serviceKey" IN ('DOC_MANAGER', 'WORKFLOWS', 'AI_ASSISTANT');
DELETE FROM "IntegrationConnection" WHERE "provider" = 'SLACK';

-- DropForeignKey
ALTER TABLE "DocumentField" DROP CONSTRAINT IF EXISTS "DocumentField_templateId_fkey";
ALTER TABLE "DocumentRequest" DROP CONSTRAINT IF EXISTS "DocumentRequest_companyId_fkey";
ALTER TABLE "DocumentRequest" DROP CONSTRAINT IF EXISTS "DocumentRequest_createdById_fkey";
ALTER TABLE "DocumentRequest" DROP CONSTRAINT IF EXISTS "DocumentRequest_templateId_fkey";
ALTER TABLE "DocumentTemplate" DROP CONSTRAINT IF EXISTS "DocumentTemplate_companyId_fkey";
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_userId_fkey";
ALTER TABLE "OrderItem" DROP CONSTRAINT IF EXISTS "OrderItem_orderId_fkey";
ALTER TABLE "Workflow" DROP CONSTRAINT IF EXISTS "Workflow_companyId_fkey";
ALTER TABLE "WorkflowRun" DROP CONSTRAINT IF EXISTS "WorkflowRun_companyId_fkey";
ALTER TABLE "WorkflowRun" DROP CONSTRAINT IF EXISTS "WorkflowRun_workflowId_fkey";
ALTER TABLE "WorkflowRunStep" DROP CONSTRAINT IF EXISTS "WorkflowRunStep_runId_fkey";

-- DropTable
DROP TABLE IF EXISTS "DocumentField";
DROP TABLE IF EXISTS "DocumentRequest";
DROP TABLE IF EXISTS "DocumentTemplate";
DROP TABLE IF EXISTS "Order";
DROP TABLE IF EXISTS "OrderItem";
DROP TABLE IF EXISTS "WorkflowRunStep";
DROP TABLE IF EXISTS "WorkflowRun";
DROP TABLE IF EXISTS "Workflow";

-- AlterEnum: IntegrationProvider — remove SLACK
-- Create new enum without SLACK, migrate data, swap
CREATE TYPE "IntegrationProvider_new" AS ENUM ('FATTURE_IN_CLOUD', 'STRIPE_CONNECT');
ALTER TABLE "IntegrationConnection" ALTER COLUMN "provider" TYPE "IntegrationProvider_new" USING ("provider"::text::"IntegrationProvider_new");
ALTER TYPE "IntegrationProvider" RENAME TO "IntegrationProvider_old";
ALTER TYPE "IntegrationProvider_new" RENAME TO "IntegrationProvider";
DROP TYPE "IntegrationProvider_old";

-- AlterEnum: ServiceKey — remove DOC_MANAGER, WORKFLOWS, AI_ASSISTANT
CREATE TYPE "ServiceKey_new" AS ENUM ('AUTOSCUOLE');
ALTER TABLE "CompanyService" ALTER COLUMN "serviceKey" TYPE "ServiceKey_new" USING ("serviceKey"::text::"ServiceKey_new");
ALTER TYPE "ServiceKey" RENAME TO "ServiceKey_old";
ALTER TYPE "ServiceKey_new" RENAME TO "ServiceKey";
DROP TYPE "ServiceKey_old";
