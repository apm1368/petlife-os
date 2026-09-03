-- AlterTable
ALTER TABLE "support_cases" ADD COLUMN     "firstResponseAt" TIMESTAMP(3),
ADD COLUMN     "lastUserMessageAt" TIMESTAMP(3),
ADD COLUMN     "lastAdminMessageAt" TIMESTAMP(3);
