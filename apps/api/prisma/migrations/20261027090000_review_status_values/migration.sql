-- PostgreSQL requires newly-added enum values to be committed before a later
-- transaction can use them in a column default. The schema/default changes
-- therefore live in the following migration.
ALTER TYPE "ProviderReviewStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "ProviderReviewStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "ProviderReviewStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "ProductReviewStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "ProductReviewStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "ProductReviewStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "TravelReviewStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "TravelReviewStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "TravelReviewStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
