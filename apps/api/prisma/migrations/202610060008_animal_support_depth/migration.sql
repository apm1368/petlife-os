-- CreateEnum
CREATE TYPE "VolunteerInterestStatus" AS ENUM ('NEW', 'CONTACTED', 'CLOSED');


-- CreateTable
CREATE TABLE "support_need_updates" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_need_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animal_support_org_follows" (
    "userId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "animal_support_org_follows_pkey" PRIMARY KEY ("userId","organizationId")
);

-- CreateTable
CREATE TABLE "support_need_bookmarks" (
    "userId" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_need_bookmarks_pkey" PRIMARY KEY ("userId","listingId")
);

-- CreateTable
CREATE TABLE "volunteer_interests" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "kinds" TEXT[],
    "city" TEXT NOT NULL,
    "availability" TEXT,
    "note" TEXT,
    "shareContact" BOOLEAN NOT NULL DEFAULT false,
    "status" "VolunteerInterestStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "volunteer_interests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_need_updates_listingId_createdAt_idx" ON "support_need_updates"("listingId", "createdAt");

-- CreateIndex
CREATE INDEX "animal_support_org_follows_organizationId_idx" ON "animal_support_org_follows"("organizationId");

-- CreateIndex
CREATE INDEX "volunteer_interests_organizationId_status_idx" ON "volunteer_interests"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "volunteer_interests_userId_organizationId_key" ON "volunteer_interests"("userId", "organizationId");

-- AddForeignKey
ALTER TABLE "support_need_updates" ADD CONSTRAINT "support_need_updates_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "support_need_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_support_org_follows" ADD CONSTRAINT "animal_support_org_follows_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "animal_support_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_need_bookmarks" ADD CONSTRAINT "support_need_bookmarks_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "support_need_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_interests" ADD CONSTRAINT "volunteer_interests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "animal_support_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "support_need_updates" ADD CONSTRAINT "support_need_updates_body" CHECK (char_length(btrim("body")) BETWEEN 1 AND 2000);
ALTER TABLE "volunteer_interests" ADD CONSTRAINT "volunteer_interests_kinds" CHECK (cardinality("kinds") > 0 AND "kinds" <@ ARRAY['TRANSPORT', 'TEMPORARY_FOSTER', 'DELIVERY', 'ON_SITE_HELP']::text[]);
