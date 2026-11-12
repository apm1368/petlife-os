-- #290 Q54: finders can post a found pet in the community.
ALTER TYPE "CommunityPostType" ADD VALUE IF NOT EXISTS 'FOUND_PET';

-- #290 Q53: opt-in neighbourhood alerts for new lost-pet reports (private point + radius per member).
CREATE TABLE "lost_pet_area_alerts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radiusKm" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lost_pet_area_alerts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lost_pet_area_alerts_userId_key" ON "lost_pet_area_alerts"("userId");
CREATE INDEX "lost_pet_area_alerts_latitude_longitude_idx" ON "lost_pet_area_alerts"("latitude", "longitude");

ALTER TABLE "lost_pet_area_alerts" ADD CONSTRAINT "lost_pet_area_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
