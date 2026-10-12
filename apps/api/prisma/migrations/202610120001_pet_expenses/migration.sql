-- Additive only: a household-recorded expense ledger per pet.

-- CreateEnum
CREATE TYPE "PetExpenseCategory" AS ENUM ('FOOD', 'VET', 'MEDICATION', 'GROOMING', 'TRAINING', 'BOARDING', 'SUPPLIES', 'INSURANCE', 'TRANSPORT', 'OTHER');

-- CreateTable
CREATE TABLE "pet_expenses" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "category" "PetExpenseCategory" NOT NULL,
    "amountIrr" INTEGER NOT NULL,
    "spentOn" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_expenses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pet_expenses_amount_positive" CHECK ("amountIrr" > 0)
);

-- CreateIndex
CREATE INDEX "pet_expenses_petId_spentOn_idx" ON "pet_expenses"("petId", "spentOn");

-- AddForeignKey
ALTER TABLE "pet_expenses" ADD CONSTRAINT "pet_expenses_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
