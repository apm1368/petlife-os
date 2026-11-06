CREATE TYPE "PetMemorialStatus" AS ENUM ('PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'WITHDRAWN');

CREATE TABLE "pet_memorial_submissions" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "displayName" VARCHAR(120) NOT NULL,
    "imageMemoryId" UUID NOT NULL,
    "imageObjectKey" TEXT NOT NULL,
    "consentVersion" VARCHAR(32) NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "status" "PetMemorialStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedByAdminId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewReason" VARCHAR(1000),
    "publishedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pet_memorial_submissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pet_memorial_audit_events" (
    "id" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "actorUserId" UUID,
    "actorAdminId" UUID,
    "action" VARCHAR(40) NOT NULL,
    "fromStatus" VARCHAR(40),
    "toStatus" VARCHAR(40),
    "reason" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pet_memorial_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pet_memorial_submissions_status_submittedAt_idx" ON "pet_memorial_submissions"("status", "submittedAt");
CREATE INDEX "pet_memorial_submissions_ownerUserId_petId_createdAt_idx" ON "pet_memorial_submissions"("ownerUserId", "petId", "createdAt");
CREATE INDEX "pet_memorial_audit_events_submissionId_createdAt_idx" ON "pet_memorial_audit_events"("submissionId", "createdAt");

-- A pet can have only one active submission/publication at a time. Withdrawn
-- or rejected records remain in the history and permit a later resubmission.
CREATE UNIQUE INDEX "pet_memorial_one_active_submission_per_pet"
ON "pet_memorial_submissions"("petId")
WHERE "status" IN ('PENDING_REVIEW', 'PUBLISHED');

ALTER TABLE "pet_memorial_submissions"
  ADD CONSTRAINT "pet_memorial_submissions_petId_fkey"
  FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pet_memorial_submissions"
  ADD CONSTRAINT "pet_memorial_submissions_imageMemoryId_fkey"
  FOREIGN KEY ("imageMemoryId") REFERENCES "pet_memories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION prevent_pet_memorial_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'pet memorial audit events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "pet_memorial_audit_events_immutable"
BEFORE UPDATE OR DELETE ON "pet_memorial_audit_events"
FOR EACH ROW EXECUTE FUNCTION prevent_pet_memorial_audit_mutation();
