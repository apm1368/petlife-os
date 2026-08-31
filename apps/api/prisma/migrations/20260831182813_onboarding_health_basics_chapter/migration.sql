-- Adds the onboarding chapter for the new Health Basics wizard steps
-- (allergies/conditions/medications/vaccination/diet), inserted after
-- PET_IDENTITY and before PERSONALIZATION in the wizard's step order.

-- AlterEnum
ALTER TYPE "OnboardingChapter" ADD VALUE 'HEALTH_BASICS';
