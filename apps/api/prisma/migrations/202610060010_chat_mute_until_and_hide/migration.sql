-- AlterTable
ALTER TABLE "chat_participants" DROP COLUMN "muted",
ADD COLUMN     "hiddenAt" TIMESTAMP(3),
ADD COLUMN     "mutedUntil" TIMESTAMP(3);

