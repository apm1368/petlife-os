import type { PetDto } from "@petlife/types";
import { localizeDigits } from "@/lib/date/jalali";
import { statusLabel } from "@/lib/status/status-labels";

/** Shared pet identity text — the pet header, the home hero and the pet list say the same thing. */
type Locale = "fa" | "en" | "de" | "es";
const localeIndex: Record<Locale, number> = { fa: 0, en: 1, de: 2, es: 3 };
const intlLocale = (locale: Locale) => ({ fa: "fa-IR", en: "en-US", de: "de-DE", es: "es-ES" })[locale];
export const SPECIES_LABELS: Record<string, [string, string, string, string]> = {
  DOG: ["سگ", "Dog", "Hund", "Perro"],
  CAT: ["گربه", "Cat", "Katze", "Gato"],
  BIRD: ["پرنده", "Bird", "Vogel", "Ave"],
  RABBIT: ["خرگوش", "Rabbit", "Kaninchen", "Conejo"],
  RODENT: ["جونده (همستر، خوکچهٔ هندی…)", "Small rodent (hamster, guinea pig…)", "Kleinnager (Hamster, Meerschweinchen …)", "Roedor pequeño (hámster, cobaya…)"],
  FISH: ["ماهی", "Fish", "Fisch", "Pez"],
  REPTILE: ["خزنده", "Reptile", "Reptil", "Reptil"],
  OTHER: ["سایر", "Other", "Andere", "Otro"],
};

/** Short species name for identity lines ("Rodent" rather than the long picker hint). */
const SPECIES_SHORT: Record<string, [string, string, string, string]> = { RODENT: ["جونده", "Rodent", "Nager", "Roedor"] };

export function speciesLabel(pet: Pick<PetDto, "species">, locale: Locale): string {
  const entry = SPECIES_SHORT[pet.species] ?? SPECIES_LABELS[pet.species];
  return entry ? entry[localeIndex[locale]]! : ({ fa: "حیوان", en: "Pet", de: "Tier", es: "Mascota" }[locale]);
}

export function petAgeMonths(pet: Pick<PetDto, "birthDate" | "approximateAgeMonths">): number | null {
  return pet.birthDate ? Math.max(0, Math.floor((Date.now() - new Date(pet.birthDate).getTime()) / 2629746000)) : pet.approximateAgeMonths;
}

/** "۱ سال و ۶ ماه" in fa, "1y 6m" in en; `unknown` when no birth date or estimate exists. */
export function formatAge(pet: Pick<PetDto, "birthDate" | "approximateAgeMonths">, locale: Locale, unknown: string): string {
  const months = petAgeMonths(pet);
  if (months === null) return unknown;
  const years = Math.floor(months / 12);
  const remaining = months % 12;
  if (locale === "fa") return localizeDigits(years > 0 ? (remaining > 0 ? `${years} سال و ${remaining} ماه` : `${years} سال`) : `${remaining} ماه`, "fa");
  const n = new Intl.NumberFormat(intlLocale(locale)).format;
  if (locale === "en") return years > 0 ? (remaining > 0 ? `${n(years)}y ${n(remaining)}m` : `${n(years)}y`) : `${n(remaining)}m`;
  const units = locale === "de" ? ["Jahr", "Jahre", "Monat", "Monate"] : ["año", "años", "mes", "meses"];
  const year = years === 1 ? units[0] : units[1];
  const month = remaining === 1 ? units[2] : units[3];
  return years > 0 ? (remaining > 0 ? `${n(years)} ${year}, ${n(remaining)} ${month}` : `${n(years)} ${year}`) : `${n(remaining)} ${month}`;
}

/** "۱۸ کیلوگرم" / "18 kg"; `unknown` when no weight is recorded. Presentation only — the stored value is untouched. */
export function formatWeight(pet: Pick<PetDto, "latestWeightValue" | "latestWeightUnit">, locale: Locale, unknown: string): string {
  if (pet.latestWeightValue === null || pet.latestWeightValue === undefined) return unknown;
  const units = { fa: { lb: "پوند", kg: "کیلوگرم" }, en: { lb: "lb", kg: "kg" }, de: { lb: "lb", kg: "kg" }, es: { lb: "lb", kg: "kg" } }[locale];
  const unit = pet.latestWeightUnit === "LB" ? units.lb : units.kg;
  // The API serialises the decimal weight as a string; format the number, not the string.
  const value = Number(pet.latestWeightValue).toLocaleString(intlLocale(locale), { maximumFractionDigits: 2 });
  return `${value} ${unit}`;
}

/** The labels PetIdentity (UI package, no i18n) needs, in the UI language. */
export function petIdentityLabels(pet: Pick<PetDto, "species" | "lifecycleStatus">, locale: Locale) {
  return { active: ({ fa: "فعال", en: "Active", de: "Aktiv", es: "Activo" }[locale]), species: speciesLabel(pet, locale), lifecycle: statusLabel(pet.lifecycleStatus, locale, "lifecycle") };
}
