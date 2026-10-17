-- CreateEnum
CREATE TYPE "AdminTaskSource" AS ENUM ('MANUAL', 'PARTNER_VERIFICATION', 'FINANCE_MISMATCH', 'HIGH_SEVERITY_REPORT', 'PRIVACY_REQUEST', 'FAILED_IMPORT', 'SUPPORT', 'CLINIC_FOLLOW_UP', 'DATA_QUALITY');

-- AlterEnum
ALTER TYPE "AdminTaskStatus" ADD VALUE 'BLOCKED';



-- AlterTable
ALTER TABLE "admin_tasks" ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "source" "AdminTaskSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "team" TEXT,
ALTER COLUMN "createdByAdminId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "admin_tasks_dedupeKey_key" ON "admin_tasks"("dedupeKey");

