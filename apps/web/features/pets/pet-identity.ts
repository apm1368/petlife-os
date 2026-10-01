import type { PetDto } from "@petlife/types";
import { localizeDigits } from "@/lib/date/jalali";

/** Shared pet identity text — the pet header, the home hero and the pet list say the same thing. */
export function speciesLabel(pet: Pick<PetDto, "species">, locale: "fa" | "en"): string {
  if (locale === "fa") return pet.species === "DOG" ? "سگ" : "گربه";
  return pet.species === "DOG" ? "Dog" : "Cat";
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
  const value = locale === "fa" ? pet.latestWeightValue.toLocaleString("fa-IR", { maximumFractionDigits: 2 }) : String(pet.latestWeightValue);
  return `${value} ${unit}`;
}
