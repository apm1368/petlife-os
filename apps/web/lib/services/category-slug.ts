/** Service categories in URLs: lowercase, hyphenated slugs (/services/pet-taxi); the API keeps its enum codes (PET_TAXI). */
export const SERVICE_CATEGORY_CODES = ["VET", "GROOMING", "TRAINING", "WALKING", "SITTING", "BOARDING", "PET_TAXI", "OTHER"] as const;
export type ServiceCategoryCode = (typeof SERVICE_CATEGORY_CODES)[number];

export const serviceCategorySlug = (code: string) => code.toLowerCase().replace(/_/g, "-");

/** "grooming", "GROOMING", "Pet-Taxi", "pet_taxi" → the enum code; anything else → null. */
export function serviceCategoryFromSlug(segment: string): ServiceCategoryCode | null {
  let decoded = segment;
  try { decoded = decodeURIComponent(segment); } catch { /* keep the raw segment */ }
  const code = decoded.trim().toUpperCase().replace(/-/g, "_");
  return (SERVICE_CATEGORY_CODES as readonly string[]).includes(code) ? (code as ServiceCategoryCode) : null;
}

export const serviceCategoryPath = (locale: string, code: string) => `/${locale}/services/${serviceCategorySlug(code)}`;
