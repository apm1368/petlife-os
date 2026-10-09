-- A provider review is one more report target; keep "exactly one target per report".
ALTER TABLE "community_reports" DROP CONSTRAINT "community_reports_single_target";
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_single_target" CHECK (
  (("postId" IS NOT NULL)::int + ("commentId" IS NOT NULL)::int + ("supportNeedListingId" IS NOT NULL)::int + ("lostPetIncidentId" IS NOT NULL)::int + ("lostPetSightingId" IS NOT NULL)::int + ("organizationId" IS NOT NULL)::int + ("chatMessageId" IS NOT NULL)::int + ("providerReviewId" IS NOT NULL)::int) = 1
);

-- G18: services can be recently viewed too (still public catalogue items only).
ALTER TABLE "recently_viewed" DROP CONSTRAINT "recently_viewed_type";
ALTER TABLE "recently_viewed" ADD CONSTRAINT "recently_viewed_type" CHECK ("entityType" IN ('PROVIDER', 'SERVICE', 'PRODUCT', 'TRAVEL_LISTING', 'PLACE', 'ARTICLE', 'SUPPORT_NEED'));
