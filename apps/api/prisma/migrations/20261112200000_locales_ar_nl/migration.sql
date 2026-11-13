-- Arabic (RTL) and Dutch become full site languages (owner, 2026-11-12): per-locale content (blog articles,
-- categories, help, notification preferences, user locale) may now be stored as ar/nl.
ALTER TYPE "Locale" ADD VALUE IF NOT EXISTS 'ar';
ALTER TYPE "Locale" ADD VALUE IF NOT EXISTS 'nl';
