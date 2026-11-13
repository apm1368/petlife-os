-- Partner support: a case opened from a provider or shop panel belongs to that organization.
ALTER TABLE "support_cases" ADD COLUMN "requesterOrgType" "PartnerSubjectType",
ADD COLUMN "requesterOrgId" UUID;

ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_requester_org_pair"
  CHECK (("requesterOrgType" IS NULL) = ("requesterOrgId" IS NULL));

CREATE INDEX "support_cases_requesterOrgType_requesterOrgId_idx" ON "support_cases"("requesterOrgType", "requesterOrgId");
