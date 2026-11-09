-- Household & pet-ownership module (ID-01, ID-02, ID-03, ID-05, ID-06, ID-07).
--
-- ID-01 "Every pet has exactly one primary owner; the household only grants access;
--        ownership transfer needs both parties' approval"
--   -> pet_ownerships (one row per pet, the single accountable owner) and
--      pet_ownership_transfers (a request that only applies once BOTH parties approve).
-- ID-02 "the separated member keeps a read-only copy of the memories they recorded"
--   -> pet_memory_copies (a read grant pointing at the original memory row).
-- ID-03 "OptLife does not judge; the registered owner stays until an official ruling
--        or a written agreement"
--   -> the DISPUTED transfer status records the disagreement without reassigning the pet.
-- ID-05 "the health record goes, the memories by the previous owner's choice, the costs do not"
--   -> pet_ownership_transfers.memoryDisposition carries the previous owner's choice.
-- ID-06 "Bookings, subscriptions, and reminders move with the pet"
--   -> handled by the service when a transfer is applied.
-- ID-07 "the payer of recurring items transfers to the new owner; it is suspended
--        until their approval"
--   -> subscriptions.payerUserId plus the renewal hold in the billing service.

CREATE TYPE "PetOwnershipTransferStatus" AS ENUM ('PENDING_REVIEW', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'DISPUTED');

CREATE TYPE "PetOwnershipMemoryDisposition" AS ENUM ('TRANSFER', 'RETAIN', 'COPY_READ_ONLY');

CREATE TABLE "pet_ownerships" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "transferredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transferReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_ownerships_pkey" PRIMARY KEY ("id")
);

-- One primary owner per pet: the uniqueness is the enforcement of "exactly one" (ID-01).
CREATE UNIQUE INDEX "pet_ownerships_petId_key" ON "pet_ownerships"("petId");
CREATE INDEX "pet_ownerships_ownerUserId_idx" ON "pet_ownerships"("ownerUserId");

CREATE TABLE "pet_ownership_transfers" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "fromUserId" UUID NOT NULL,
    "toUserId" UUID NOT NULL,
    "fromHouseholdId" UUID NOT NULL,
    "toHouseholdId" UUID NOT NULL,
    "status" "PetOwnershipTransferStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "memoryDisposition" "PetOwnershipMemoryDisposition" NOT NULL DEFAULT 'RETAIN',
    "respondedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_ownership_transfers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pet_ownership_transfers_petId_status_idx" ON "pet_ownership_transfers"("petId", "status");
CREATE INDEX "pet_ownership_transfers_toUserId_status_idx" ON "pet_ownership_transfers"("toUserId", "status");
CREATE INDEX "pet_ownership_transfers_fromUserId_status_idx" ON "pet_ownership_transfers"("fromUserId", "status");

CREATE TABLE "pet_memory_copies" (
    "id" UUID NOT NULL,
    "memoryId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_memory_copies_pkey" PRIMARY KEY ("id")
);

-- The same memory is copied to the same person only once.
CREATE UNIQUE INDEX "pet_memory_copies_memoryId_userId_key" ON "pet_memory_copies"("memoryId", "userId");
CREATE INDEX "pet_memory_copies_userId_createdAt_idx" ON "pet_memory_copies"("userId", "createdAt");

-- ID-07: the recorded payer of a subscription. NULL means "no payer designated",
-- in which case the household's owner is used (the pre-existing behaviour).
ALTER TABLE "subscriptions" ADD COLUMN "payerUserId" UUID;

-- Backfill: give every existing pet an explicit primary owner.
--
-- The historical model had no owner column, so the primary owner must be inferred:
-- the household's earliest OWNER member (the household creator in practice), falling
-- back to the earliest member of any role. Existing pets therefore keep exactly the
-- person who already had the owner preset in PetAccessService.applyHouseholdDefaults.
INSERT INTO "pet_ownerships" ("id", "petId", "ownerUserId", "householdId", "transferredAt", "createdAt", "updatedAt")
SELECT
    gen_random_uuid(),
    p."id",
    COALESCE(
        (SELECT hm."userId" FROM "household_members" hm WHERE hm."householdId" = p."householdId" AND hm."role" = 'OWNER' ORDER BY hm."createdAt" ASC LIMIT 1),
        (SELECT hm."userId" FROM "household_members" hm WHERE hm."householdId" = p."householdId" ORDER BY hm."createdAt" ASC LIMIT 1)
    ),
    p."householdId",
    p."createdAt",
    p."createdAt",
    p."updatedAt"
FROM "pets" p
WHERE p."deletedAt" IS NULL
  AND EXISTS (SELECT 1 FROM "household_members" hm WHERE hm."householdId" = p."householdId");
