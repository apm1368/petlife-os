"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, Input, Select } from "@petlife/ui";
import { DateRangeField } from "@/features/shared/date-picker/DateRangePicker";
import { addDays, todayIso } from "@/lib/date/jalali";
import { TravelMode } from "@petlife/types";
import { travelService } from "@/services/travel.service";
import { apiErrorText } from "@/lib/errors/api-error-text";

const TRAVEL_MODES: TravelMode[] = [TravelMode.AIR, TravelMode.ROAD, TravelMode.RAIL, TravelMode.SEA, TravelMode.OTHER];

export function NewTripView({ petId }: { petId: string }) {
  const t = useTranslations("travel");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [originCountry, setOriginCountry] = useState("IR");
  const [originCity, setOriginCity] = useState("");
  const [destinationCountry, setDestinationCountry] = useState("");
  const [destinationCity, setDestinationCity] = useState("");
  const [departAt, setDepartAt] = useState("");
  const [returnAt, setReturnAt] = useState("");
  const [travelMode, setTravelMode] = useState<TravelMode>(TravelMode.AIR);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = originCountry.trim().length === 2 && destinationCountry.trim().length === 2 && departAt.length > 0;

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const trip = await travelService.create(petId, {
        originCountry: originCountry.trim().toUpperCase(),
        originCity: originCity.trim() || undefined,
        destinationCountry: destinationCountry.trim().toUpperCase(),
        destinationCity: destinationCity.trim() || undefined,
        // Calendar days are Tehran-local; noon avoids the day shifting across time zones.
        departAt: new Date(`${departAt}T12:00:00+03:30`).toISOString(),
        returnAt: returnAt ? new Date(`${returnAt}T12:00:00+03:30`).toISOString() : undefined,
        travelMode,
        notes: notes.trim() || undefined,
      });
      router.push(`/pets/${petId}/travel/${trip.id}`);
    } catch (err) {
      setError(apiErrorText(err, undefined, tCommon("genericError")));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("newTrip.title")}</h1>
      <p className="text-body text-text-secondary">{t("newTrip.subtitle")}</p>

      <ContextSurface className="flex flex-col gap-4">
        <Input label={t("newTrip.originCountryLabel")} value={originCountry} onChange={(e) => setOriginCountry(e.target.value)} maxLength={2} placeholder="IR" />
        <Input label={t("newTrip.originCityLabel")} value={originCity} onChange={(e) => setOriginCity(e.target.value)} />
        <Input label={t("newTrip.destinationCountryLabel")} value={destinationCountry} onChange={(e) => setDestinationCountry(e.target.value)} maxLength={2} placeholder="TR" />
        <Input label={t("newTrip.destinationCityLabel")} value={destinationCity} onChange={(e) => setDestinationCity(e.target.value)} />
        <DateRangeField mode="single" label={t("newTrip.departAtLabel")} value={{ start: departAt || null, end: null }} onChange={(v) => { setDepartAt(v.start ?? ""); if (returnAt && v.start && returnAt < v.start) setReturnAt(""); }} min={todayIso()} max={addDays(todayIso(), 730)} />
        <DateRangeField mode="single" label={t("newTrip.returnAtLabel")} value={{ start: returnAt || null, end: null }} onChange={(v) => setReturnAt(v.start ?? "")} min={departAt || todayIso()} max={addDays(todayIso(), 730)} />
        <Select
          label={t("newTrip.travelModeLabel")}
          value={travelMode}
          onChange={(e) => setTravelMode(e.target.value as TravelMode)}
          options={TRAVEL_MODES.map((mode) => ({ value: mode, label: t(`travelMode.${mode}`) }))}
        />
        <Input label={t("newTrip.notesLabel")} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {error ? <p className="text-body text-state-urgent">{error}</p> : null}
        <Button variant="primary" isLoading={isSubmitting} onClick={handleSubmit} disabled={!canSubmit}>
          {t("newTrip.submit")}
        </Button>
      </ContextSurface>
    </div>
  );
}
