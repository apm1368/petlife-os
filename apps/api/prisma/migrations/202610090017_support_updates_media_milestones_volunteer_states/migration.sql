-- Volunteer interest states (G16): NEW is the member's INTERESTED; organisations move it on explicitly.
ALTER TYPE "VolunteerInterestStatus" RENAME VALUE 'NEW' TO 'INTERESTED';
ALTER TYPE "VolunteerInterestStatus" ADD VALUE 'ACCEPTED';
ALTER TYPE "VolunteerInterestStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "VolunteerInterestStatus" ADD VALUE 'CANCELLED';
ALTER TABLE "volunteer_interests" ALTER COLUMN "status" SET DEFAULT 'INTERESTED';
ALTER TABLE "volunteer_interests" ADD COLUMN "listingId" UUID;

-- Need updates may carry uploaded images.
ALTER TABLE "support_need_updates" ADD COLUMN "mediaObjectKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "support_need_updates" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Milestones reached, recorded once.
CREATE TABLE "support_need_milestones" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "reachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "support_need_milestones_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "support_need_milestones_listingId_key_key" ON "support_need_milestones"("listingId", "key");
ALTER TABLE "support_need_milestones" ADD CONSTRAINT "support_need_milestones_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "support_need_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
