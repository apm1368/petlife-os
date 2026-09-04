import { TravelRequirementType } from "@prisma/client";

/**
 * A code-defined, non-DB-editable catalog of the requirement types that
 * typically apply for a destination — mirrors CountryConfig's own "code,
 * not a table" convention (H10) so travel rules are never hardcoded into
 * frontend components: the frontend never holds this catalog, it only ever
 * reads real TravelRequirement rows the household actually created from the
 * API. This is a starting checklist suggestion only — never authoritative,
 * never auto-applied, and adding a suggested type still creates the
 * requirement at its safe UNKNOWN default (see TravelRequirementService.create).
 */
const DEFAULT_TEMPLATE: TravelRequirementType[] = [
  TravelRequirementType.VACCINATION,
  TravelRequirementType.RABIES,
  TravelRequirementType.MICROCHIP,
  TravelRequirementType.HEALTH_CERTIFICATE,
  TravelRequirementType.CARRIER,
  TravelRequirementType.AIRLINE_POLICY,
];

const DESTINATION_TEMPLATES: Record<string, TravelRequirementType[]> = {
  IR: [
    TravelRequirementType.VACCINATION,
    TravelRequirementType.RABIES,
    TravelRequirementType.MICROCHIP,
    TravelRequirementType.HEALTH_CERTIFICATE,
    TravelRequirementType.IMPORT_PERMIT,
    TravelRequirementType.CARRIER,
    TravelRequirementType.PARASITE_TREATMENT,
  ],
};

/** Iran-first, globally extensible: an unlisted destination country code falls back to DEFAULT_TEMPLATE rather than returning nothing. */
export function getSuggestedRequirementTypes(destinationCountry: string): TravelRequirementType[] {
  return DESTINATION_TEMPLATES[destinationCountry.trim().toUpperCase()] ?? DEFAULT_TEMPLATE;
}
