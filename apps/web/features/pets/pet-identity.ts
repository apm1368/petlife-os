import type { PetDto } from "@petlife/types";
import { localizeDigits } from "@/lib/date/jalali";
import { statusLabel } from "@/lib/status/status-labels";

/** Shared pet identity text — the pet header, the home hero and the pet list say the same thing. */
export const SPECIES_LABELS: Record<string, [string, string]> = {
  DOG: ["سگ", "Dog"],
  CAT: ["گربه", "Cat"],
  BIRD: ["پرنده", "Bird"],
  RABBIT: ["خرگوش", "Rabbit"],
  RODENT: ["جونده (همستر، خوکچهٔ هندی…)", "Small rodent (hamster, guinea pig…)"],
  FISH: ["ماهی", "Fish"],
  REPTILE: ["خزنده", "Reptile"],
  OTHER: ["سایر", "Other"],
};

/** Short species name for identity lines ("Rodent" rather than the long picker hint). */
const SPECIES_SHORT: Record<string, [string, string]> = { RODENT: ["جونده", "Rodent"] };

export function speciesLabel(pet: Pick<PetDto, "species">, locale: "fa" | "en"): string {
  const entry = SPECIES_SHORT[pet.species] ?? SPECIES_LABELS[pet.species];
  return entry ? entry[locale === "fa" ? 0 : 1] : locale === "fa" ? "حیوان" : "Pet";
}

export function petAgeMonths(pet: Pick<PetDto, "birthDate" | "approximateAgeMonths">): number | null {
  return pet.birthDate ? Math.max(0, Math.floor((Date.now() - new Date(pet.birthDate).getTime()) / 2629746000)) : pet.approximateAgeMonths;
}

/** "۱ سال و ۶ ماه" in fa, "1y 6m" in en; `unknown` when no birth date or estimate exists. */
export function formatAge(pet: Pick<PetDto, "birthDate" | "approximateAgeMonths">, locale: "fa" | "en", unknown: string): string {
  const months = petAgeMonths(pet);
  if (months === null) return unknown;
  const years = Math.floor(months / 12);
  const remaining = months % 12;
  if (locale === "fa") return localizeDigits(years > 0 ? (remaining > 0 ? `${years} سال و ${remaining} ماه` : `${years} سال`) : `${remaining} ماه`, "fa");
  return years > 0 ? (remaining > 0 ? `${years}y ${remaining}m` : `${years}y`) : `${remaining}m`;
}

/** "۱۸ کیلوگرم" / "18 kg"; `unknown` when no weight is recorded. Presentation only — the stored value is untouched. */
export function formatWeight(pet: Pick<PetDto, "latestWeightValue" | "latestWeightUnit">, locale: "fa" | "en", unknown: string): string {
  if (pet.latestWeightValue === null || pet.latestWeightValue === undefined) return unknown;
  const unit = pet.latestWeightUnit === "LB" ? (locale === "fa" ? "پوند" : "lb") : locale === "fa" ? "کیلوگرم" : "kg";
  // The API serialises the decimal weight as a string; format the number, not the string.
  const value = Number(pet.latestWeightValue).toLocaleString(locale === "fa" ? "fa-IR" : "en-US", { maximumFractionDigits: 2 });
  return `${value} ${unit}`;
}

/** The labels PetIdentity (UI package, no i18n) needs, in the UI language. */
export function petIdentityLabels(pet: Pick<PetDto, "species" | "lifecycleStatus">, locale: "fa" | "en") {
  return { active: locale === "fa" ? "فعال" : "Active", species: speciesLabel(pet, locale), lifecycle: statusLabel(pet.lifecycleStatus, locale, "lifecycle") };
}
