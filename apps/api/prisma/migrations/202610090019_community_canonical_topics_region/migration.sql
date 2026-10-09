-- G17: optional region on posts, and the canonical topic taxonomy.
ALTER TABLE "community_posts" ADD COLUMN "region" TEXT;

ALTER TABLE "community_posts" DROP CONSTRAINT "community_posts_topics";

-- Map pre-G17 topic codes onto DOG, CAT, HEALTH, TRAINING, TRAVEL, LOST_PET, SUPPORT, GENERAL (order kept, duplicates dropped).
UPDATE "community_posts" p SET "topics" = sub.topics
FROM (
  SELECT id, ARRAY(
    SELECT t FROM (
      SELECT DISTINCT ON (mapped) mapped AS t, ord
      FROM unnest(topics) WITH ORDINALITY AS u(code, ord),
      LATERAL (SELECT CASE code WHEN 'DOGS' THEN 'DOG' WHEN 'CATS' THEN 'CAT' WHEN 'LOST_PETS' THEN 'LOST_PET' WHEN 'ADOPTION' THEN 'SUPPORT' WHEN 'NUTRITION' THEN 'HEALTH' WHEN 'OTHER' THEN 'GENERAL' ELSE code END AS mapped) m
      ORDER BY mapped, ord
    ) d ORDER BY ord
  ) AS topics
  FROM "community_posts" WHERE cardinality(topics) > 0
) sub
WHERE p.id = sub.id;

ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_topics" CHECK ("topics" <@ ARRAY['DOG', 'CAT', 'HEALTH', 'TRAINING', 'TRAVEL', 'LOST_PET', 'SUPPORT', 'GENERAL']::text[] AND cardinality("topics") <= 3);
