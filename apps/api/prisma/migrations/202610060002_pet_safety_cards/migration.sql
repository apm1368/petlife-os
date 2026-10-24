-- CreateEnum
CREATE TYPE "PetShareCardKind" AS ENUM ('EMERGENCY', 'ID_TAG');


-- CreateTable
CREATE TABLE "pet_emergency_info" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactRelation" TEXT,
    "bloodType" TEXT,
    "criticalNotes" TEXT,
    "updatedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_emergency_info_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_share_cards" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "kind" "PetShareCardKind" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenHint" TEXT NOT NULL,
    "includeContact" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "lastAccessedAt" TIMESTAMP(3),
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_share_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pet_emergency_info_petId_key" ON "pet_emergency_info"("petId");

-- CreateIndex
CREATE UNIQUE INDEX "pet_share_cards_tokenHash_key" ON "pet_share_cards"("tokenHash");

-- CreateIndex
CREATE INDEX "pet_share_cards_petId_kind_idx" ON "pet_share_cards"("petId", "kind");

-- AddForeignKey
ALTER TABLE "pet_emergency_info" ADD CONSTRAINT "pet_emergency_info_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_share_cards" ADD CONSTRAINT "pet_share_cards_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "pet_emergency_info" ADD CONSTRAINT "pet_emergency_info_lengths" CHECK (
  coalesce(char_length("contactName"), 0) <= 80 AND coalesce(char_length("contactPhone"), 0) <= 20 AND
  coalesce(char_length("contactRelation"), 0) <= 40 AND coalesce(char_length("bloodType"), 0) <= 20 AND
  coalesce(char_length("criticalNotes"), 0) <= 500);
CREATE UNIQUE INDEX "pet_share_cards_one_active" ON "pet_share_cards" ("petId", "kind") WHERE "revokedAt" IS NULL;
