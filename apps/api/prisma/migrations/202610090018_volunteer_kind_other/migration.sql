-- G16: volunteers may offer OTHER help too.
ALTER TABLE "volunteer_interests" DROP CONSTRAINT "volunteer_interests_kinds";
ALTER TABLE "volunteer_interests" ADD CONSTRAINT "volunteer_interests_kinds" CHECK (cardinality("kinds") > 0 AND "kinds" <@ ARRAY['TRANSPORT', 'TEMPORARY_FOSTER', 'DELIVERY', 'ON_SITE_HELP', 'OTHER']::text[]);
