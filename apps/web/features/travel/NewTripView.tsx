"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, Input, Select } from "@petlife/ui";
import { TravelMode } from "@petlife/types";
import { travelService } from "@/services/travel.service";
import { ApiError } from "@/lib/api/client";

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
        departAt: new Date(departAt).toISOString(),
        returnAt: returnAt ? new Date(returnAt).toISOString() : undefined,
        travelMode,
        notes: notes.trim() || undefined,
      });
      router.push(`/pets/${petId}/travel/${trip.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
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
        <Input label={t("newTrip.departAtLabel")} type="date" value={departAt} onChange={(e) => setDepartAt(e.target.value)} />
        <Input label={t("newTrip.returnAtLabel")} type="date" value={returnAt} onChange={(e) => setReturnAt(e.target.value)} />
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
