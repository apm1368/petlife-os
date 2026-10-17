-- CreateEnum
CREATE TYPE "UserAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED');



-- AlterTable
ALTER TABLE "users" ADD COLUMN     "accountStatus" "UserAccountStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedByAdminId" UUID,
ADD COLUMN     "suspendedReason" TEXT;

