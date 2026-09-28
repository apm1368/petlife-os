"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, Search } from "@petlife/ui";
import type { TravelDestinationDto } from "@petlife/types";
import { DateRangeField, type DateRangeValue } from "@/features/shared/date-picker/DateRangePicker";
import { addDays, isIsoDay, localizeDigits, todayIso } from "@/lib/date/jalali";
import { travelMarketService } from "@/services/travel-marketplace.service";
import { petWeightKg, readChosenPetIds, useMyPets, writeChosenPetIds } from "./use-my-pets";

export interface TravelSearchState {
  city: string;
  checkIn: string | null;
  checkOut: string | null;
  species: "DOG" | "CAT" | "OTHER" | "";
  petCount: number;
  petWeightKg: string;
}

export function searchStateFromParams(p: URLSearchParams): TravelSearchState {
  const checkIn = p.get("checkIn");
  const checkOut = p.get("checkOut");
  const species = p.get("species");
  return {
    city: p.get("city") ?? "",
    checkIn: isIsoDay(checkIn) ? checkIn : null,
    checkOut: isIsoDay(checkOut) ? checkOut : null,
    species: species === "DOG" || species === "CAT" || species === "OTHER" ? species : "",
    petCount: Math.min(5, Math.max(1, Number(p.get("petCount") ?? 1) || 1)),
    petWeightKg: p.get("petWeightKg") ?? "",
  };
}

export function searchUrl(locale: string, s: TravelSearchState, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  if (s.city.trim()) q.set("city", s.city.trim());
  if (s.checkIn && s.checkOut) {
    q.set("checkIn", s.checkIn);
    q.set("checkOut", s.checkOut);
  }
  if (s.species) q.set("species", s.species);
  if (s.species && s.petCount > 1) q.set("petCount", String(s.petCount));
  if (s.species && s.petWeightKg) q.set("petWeightKg", s.petWeightKg);
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  return `/${locale}/travel/search${q.toString() ? `?${q}` : ""}`;
}

/**
 * Destination + dates + pets. Signed-in travellers pick their own pets (weights come from the
 * profile, so the pet match is exact); guests describe the pet anonymously. Nothing here is a
 * promise of availability — the results page asks the server.
 */
export function TravelSearchForm({ initial, compact = false, onSubmitted }: { initial?: Partial<TravelSearchState>; compact?: boolean; onSubmitted?: () => void }) {
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";
  const router = useRouter();
  const pets = useMyPets();
  const [destinations, setDestinations] = useState<TravelDestinationDto[]>([]);
  const [state, setState] = useState<TravelSearchState>({ city: "", checkIn: null, checkOut: null, species: "", petCount: 1, petWeightKg: "", ...initial });
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    travelMarketService.destinations().then(setDestinations).catch(() => setDestinations([]));
    setChosen(readChosenPetIds());
  }, []);

  useEffect(() => {
    if (!pets?.length) return;
    setChosen((c) => {
      const valid = c.filter((id) => pets.some((p) => p.id === id));
      return valid.length ? valid : pets.length === 1 ? [pets[0]!.id] : valid;
    });
  }, [pets]);

  const suggestions = useMemo(() => {
    const q = state.city.trim().toLowerCase();
    return destinations.filter((d) => !q || d.city.toLowerCase().includes(q) || (d.province ?? "").toLowerCase().includes(q)).slice(0, 8);
  }, [destinations, state.city]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((state.checkIn && !state.checkOut) || (!state.checkIn && state.checkOut)) {
      setError(fa ? "هر دو تاریخ ورود و خروج را انتخاب کنید." : "Choose both check-in and check-out.");
      return;
    }
    const signedInPets = pets?.filter((p) => chosen.includes(p.id)) ?? [];
    let next = state;
    if (signedInPets.length) {
      writeChosenPetIds(signedInPets.map((p) => p.id));
      const species = signedInPets.every((p) => p.species === signedInPets[0]!.species) ? (signedInPets[0]!.species as TravelSearchState["species"]) : "";
      const w = Math.max(...signedInPets.map((p) => petWeightKg(p) ?? 0));
      next = { ...state, species, petCount: signedInPets.length, petWeightKg: w > 0 ? String(w) : "" };
    } else writeChosenPetIds([]);
    setError(null);
    router.push(searchUrl(lang, next));
    onSubmitted?.();
  };

  const listId = compact ? "travel-dest-compact" : "travel-dest";
  return (
    <form onSubmit={submit} className={compact ? "flex flex-col gap-4" : "grid gap-4 rounded-lg border border-border-subtle bg-surface-elevated p-4 md:grid-cols-[1.2fr_1.4fr_1fr_auto] md:items-end md:p-5"} role="search" aria-label={fa ? "جستجوی اقامت" : "Search stays"}>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-text-primary">{fa ? "مقصد" : "Destination"}</span>
        <input
          list={listId}
          value={state.city}
          onChange={(e) => setState({ ...state, city: e.target.value })}
          placeholder={fa ? "شهر یا استان" : "City or province"}
          className="min-h-12 rounded-md border border-border-subtle bg-surface-base px-3 text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          autoComplete="off"
        />
        <datalist id={listId}>
          {suggestions.map((d) => (
            <option key={`${d.country}-${d.city}`} value={d.city}>{`${d.province ? `${d.province} · ` : ""}${fa ? `${localizeDigits(d.listingCount, "fa")} اقامتگاه` : `${d.listingCount} stays`}`}</option>
          ))}
        </datalist>
      </label>
      <DateRangeField
        label={fa ? "تاریخ ورود و خروج" : "Check-in and check-out"}
        value={{ start: state.checkIn, end: state.checkOut }}
        onChange={(v: DateRangeValue) => setState({ ...state, checkIn: v.start, checkOut: v.end })}
        min={todayIso()}
        max={addDays(todayIso(), 365)}
        error={error}
      />
      {pets && pets.length > 0 ? (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium text-text-primary">{fa ? "همراهان شما" : "Travelling pets"}</legend>
          <div className="flex flex-wrap gap-2">
            {pets.map((p) => {
              const on = chosen.includes(p.id);
              return (
                <button type="button" key={p.id} aria-pressed={on} onClick={() => setChosen(on ? chosen.filter((x) => x !== p.id) : [...chosen, p.id].slice(0, 5))} className={`min-h-11 rounded-full border px-3 text-sm ${on ? "border-brand-natural bg-brand-natural/10 text-text-primary" : "border-border-subtle text-text-secondary"}`}>
                  {on ? "✓ " : ""}{p.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : (
        <fieldset className="grid grid-cols-[1fr_auto] gap-2">
          <legend className="mb-1 text-sm font-medium text-text-primary">{fa ? "حیوان همراه" : "Travelling pet"}</legend>
          <select aria-label={fa ? "گونه" : "Species"} value={state.species} onChange={(e) => setState({ ...state, species: e.target.value as TravelSearchState["species"] })} className="min-h-12 rounded-md border border-border-subtle bg-surface-base px-2 text-text-primary">
            <option value="">{fa ? "بدون فیلتر حیوان" : "Any"}</option>
            <option value="DOG">{fa ? "سگ" : "Dog"}</option>
            <option value="CAT">{fa ? "گربه" : "Cat"}</option>
            <option value="OTHER">{fa ? "سایر" : "Other"}</option>
          </select>
          <select aria-label={fa ? "تعداد" : "Number of pets"} value={state.petCount} disabled={!state.species} onChange={(e) => setState({ ...state, petCount: Number(e.target.value) })} className="min-h-12 rounded-md border border-border-subtle bg-surface-base px-2 text-text-primary">
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{localizeDigits(n, lang)}</option>)}
          </select>
          {state.species === "DOG" ? (
            <input inputMode="decimal" aria-label={fa ? "وزن تقریبی (کیلوگرم)" : "Approx. weight (kg)"} placeholder={fa ? "وزن (کیلوگرم) — اختیاری" : "Weight (kg) — optional"} value={state.petWeightKg} onChange={(e) => setState({ ...state, petWeightKg: e.target.value.replace(/[^\d.]/g, "").slice(0, 5) })} className="col-span-2 min-h-11 rounded-md border border-border-subtle bg-surface-base px-3 text-sm" />
          ) : null}
        </fieldset>
      )}
      <Button type="submit" size="lg" className="min-h-12">
        <Search aria-hidden className="h-5 w-5" />
        {fa ? "جستجو" : "Search"}
      </Button>
    </form>
  );
}
