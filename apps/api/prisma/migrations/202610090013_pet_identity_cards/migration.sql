-- CreateEnum
CREATE TYPE "PetCardContactMode" AS ENUM ('IN_APP', 'PHONE', 'BOTH');

-- AlterTable
ALTER TABLE "lost_pet_incidents" ADD COLUMN     "identityCardId" UUID;

-- AlterTable
ALTER TABLE "pet_share_cards" ADD COLUMN     "contactMode" "PetCardContactMode" NOT NULL DEFAULT 'IN_APP',
ADD COLUMN     "phoneConsentAt" TIMESTAMP(3),
ADD COLUMN     "replacedByCardId" UUID,
ADD COLUMN     "visibleFields" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "pet_card_contact_messages" (
    "id" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "finderContact" TEXT,
    "senderUserId" UUID,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_card_contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pet_card_contact_messages_petId_createdAt_idx" ON "pet_card_contact_messages"("petId", "createdAt");

-- AddForeignKey
ALTER TABLE "pet_card_contact_messages" ADD CONSTRAINT "pet_card_contact_messages_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "pet_share_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: existing cards keep the fields they already showed (minus the microchip number, now status-only);
-- contact moves to IN_APP — a phone is shown only after the owner explicitly consents (PHONE/BOTH).
UPDATE "pet_share_cards" SET "visibleFields" = ARRAY['PHOTO','SPECIES','BREED','SEX','AGE','MICROCHIP_STATUS']::TEXT[] WHERE "kind" = 'ID_TAG';
UPDATE "pet_share_cards" SET "visibleFields" = ARRAY['PHOTO','SPECIES','BREED','SEX','AGE','MICROCHIP_STATUS','ALLERGIES','CONDITIONS','MEDICATIONS','BLOOD_TYPE','CRITICAL_NOTES']::TEXT[] WHERE "kind" = 'EMERGENCY';
