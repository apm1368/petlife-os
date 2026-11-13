"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { MapPlaceDto } from "@petlife/types";
import { Button, LocateFixed, MapPin } from "@petlife/ui";
import { apiFetch } from "@/lib/api/client";
import { MapView, useMapsConfig, type MapPoint } from "./MapView";
import "./location-picker.css";

/** Iran's bounding box, the same one the API validates saved pins against. */
export const IRAN_BOUNDS = { south: 25, north: 40, west: 44, east: 63.5 } as const;
export const inIran = (p: MapPoint) => p.latitude >= IRAN_BOUNDS.south && p.latitude <= IRAN_BOUNDS.north && p.longitude >= IRAN_BOUNDS.west && p.longitude <= IRAN_BOUNDS.east;
/** Tehran until a pin, the member's location or a search says otherwise. */
const TEHRAN: MapPoint = { latitude: 35.6997, longitude: 51.338 };
const round6 = (p: MapPoint): MapPoint => ({ latitude: Math.round(p.latitude * 1e6) / 1e6, longitude: Math.round(p.longitude * 1e6) / 1e6 });

export interface LocationPickerProps {
  /** The pin, or null when none is set yet. */
  value: MapPoint | null;
  onChange: (point: MapPoint | null) => void;
  /** The person's explicit consent to store this exact point (sent as locationConsent). */
  consent: boolean;
  onConsentChange: (consent: boolean) => void;
  /** member: a private delivery pin; business: a business location the public sees; pickup: a seller's private pickup point. */
  audience: "member" | "business" | "pickup";
  /** A pin is needed to save (new delivery / pickup addresses). */
  required?: boolean;
  /** Home-based businesses: the opt-in to show the exact spot instead of a ~1 km point. Omit for storefronts and members. */
  exactPublic?: boolean;
  onExactPublicChange?: (exact: boolean) => void;
  /** Where the map opens when there is no pin yet (e.g. the city). */
  initialCenter?: MapPoint;
  /** Place search (only where the deployment has a geocoder and the person is signed in). */
  allowSearch?: boolean;
  className?: string;
}

/**
 * One way to pin a location everywhere (member addresses, clinic branches, seller pickup, partner signup): tap the map
 * or drag the pin, or use the device's location after the person asks for it. Pins outside Iran are refused here and
 * by the API. The consent checkbox and the privacy note say who will see the point; the parent sends
 * `locationConsent: true` with the pin only when it is ticked.
 */
export function LocationPicker({ value, onChange, consent, onConsentChange, audience, required, exactPublic, onExactPublicChange, initialCenter, allowSearch = true, className }: LocationPickerProps) {
  const t = useTranslations("locationPicker");
  const config = useMapsConfig();
  // The map only re-centres on a located or searched point, never while the pin is being dragged or tapped.
  const [center, setCenter] = useState<MapPoint>(value ?? initialCenter ?? TEHRAN);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MapPlaceDto[] | null>(null);

  function place(point: MapPoint, recenter = false) {
    const p = round6(point);
    if (!inIran(p)) {
      setNote({ tone: "error", text: t("outsideIran") });
      return;
    }
    setNote(null);
    onChange(p);
    if (recenter) setCenter(p);
  }

  function locate() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setNote({ tone: "error", text: t("denied") });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        place({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }, true);
      },
      () => {
        setLocating(false);
        setNote({ tone: "error", text: t("denied") });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  async function search(event?: { preventDefault(): void }) {
    event?.preventDefault();
    if (query.trim().length < 2) return;
    try {
      const near = value ?? center;
      setResults(await apiFetch<MapPlaceDto[]>(`/maps/search?${new URLSearchParams({ q: query.trim(), lat: String(near.latitude), lng: String(near.longitude) })}`));
    } catch {
      setResults([]);
    }
  }

  const missing = required && !value;
  return (
    <fieldset className={`location-picker ${className ?? ""}`} aria-describedby="location-picker-privacy">
      <legend className="location-picker__legend">
        <MapPin size={16} aria-hidden /> {t("title")}
        {required ? <span className="location-picker__required">{t("required")}</span> : null}
      </legend>
      <p className="location-picker__hint">{t("hint")}</p>

      {allowSearch && config?.search ? (
        <div className="location-picker__search" role="search">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchPlaceholder")} aria-label={t("searchPlaceholder")} onKeyDown={(e) => e.key === "Enter" && void search(e)} />
          <Button type="button" size="sm" variant="secondary" onClick={(e) => void search(e)}>
            {t("search")}
          </Button>
          {results ? (
            <ul className="location-picker__results">
              {results.length === 0 ? <li>{t("searchNone")}</li> : null}
              {results.map((r, i) => (
                <li key={`${r.latitude},${r.longitude},${i}`}>
                  <button
                    type="button"
                    onClick={() => {
                      place(r, true);
                      setResults(null);
                    }}
                  >
                    <strong>{r.label}</strong>
                    {r.address ? <small>{r.address}</small> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <MapView
        center={center}
        zoom={value ? 16 : 12}
        markers={value ? [{ id: "pin", kind: "dropoff", label: t("pinLabel"), latitude: value.latitude, longitude: value.longitude, draggable: true }] : []}
        onPick={(p) => place(p)}
        onMarkerDrag={(_, p) => place(p)}
        label={t("mapLabel")}
        zoomInLabel={t("zoomIn")}
        zoomOutLabel={t("zoomOut")}
        className="location-picker__map"
      />

      <div className="location-picker__actions">
        <Button type="button" size="sm" variant="secondary" onClick={locate} isLoading={locating}>
          <LocateFixed size={16} aria-hidden /> {locating ? t("locating") : t("useMyLocation")}
        </Button>
        {value ? (
          <>
            <span dir="ltr" className="location-picker__coords" data-testid="location-picker-coords">
              {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                onChange(null);
                onConsentChange(false);
              }}
            >
              {t("clear")}
            </Button>
          </>
        ) : null}
      </div>
      {note ? (
        <p role={note.tone === "error" ? "alert" : "status"} className={`location-picker__note location-picker__note--${note.tone}`}>
          {note.text}
        </p>
      ) : null}
      {missing ? <p className="location-picker__note location-picker__note--info">{t("pinNeeded")}</p> : null}

      <p id="location-picker-privacy" className="location-picker__privacy">
        {audience === "member" ? t("privacyMember") : audience === "pickup" ? t("privacyPickup") : t("privacyBusiness")}
      </p>
      {value ? (
        <label className="location-picker__check">
          <input type="checkbox" checked={consent} onChange={(e) => onConsentChange(e.target.checked)} />
          <span>{audience === "member" ? t("consentMember") : audience === "pickup" ? t("consentPickup") : t("consentBusiness")}</span>
        </label>
      ) : null}
      {value && onExactPublicChange ? (
        <label className="location-picker__check">
          <input type="checkbox" checked={!!exactPublic} onChange={(e) => onExactPublicChange(e.target.checked)} />
          <span>{t("exactPublic")}</span>
        </label>
      ) : null}
    </fieldset>
  );
}
