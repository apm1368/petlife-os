"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { PetTaxiDriverStateDto, PetTaxiRideDto } from "@petlife/types";
import { Button, Skeleton, StatusLabel } from "@petlife/ui";
import { formatCurrency } from "@/lib/currency/format-currency";
import type { RouteLocale } from "@/lib/i18n/config";
import { petTaxiService } from "@/services/pet-taxi.service";
import { MapView, navigationLinks, type MapMarker } from "@/features/maps/MapView";
import "./pet-taxi.css";

const POLL_MS = 6_000;
/** The phone reports its position at most this often while online. */
const PING_MS = 15_000;
const NEXT: Partial<Record<PetTaxiRideDto["status"], "ARRIVING" | "PICKED_UP" | "COMPLETED">> = { DRIVER_ASSIGNED: "ARRIVING", ARRIVING: "PICKED_UP", PICKED_UP: "COMPLETED" };

/**
 * Provider panel → Pet taxi, made for a phone on the dashboard: go online (which starts sharing the phone's position),
 * see nearby requests, accept or pass, then work the ride with a navigation link and one big button per step.
 */
export function DriverConsoleView() {
  const t = useTranslations("petTaxi.driver");
  const tm = useTranslations("petTaxi.member");
  const locale = useLocale() as RouteLocale;
  const [state, setState] = useState<PetTaxiDriverStateDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [noLocation, setNoLocation] = useState(false);
  const position = useRef<{ latitude: number; longitude: number } | null>(null);
  const lastPing = useRef(0);
  const watch = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await petTaxiService.driverState());
    } catch {
      setError(t("failed"));
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // While online: keep polling for requests / the ride, and send the phone's position on a steady beat.
  useEffect(() => {
    if (!state?.online) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const p = position.current;
      if (p && Date.now() - lastPing.current > PING_MS) {
        lastPing.current = Date.now();
        petTaxiService.presence({ online: true, ...p }).then(setState).catch(() => undefined);
      } else {
        void refresh();
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [state?.online, refresh]);

  useEffect(() => {
    if (!state?.online || !navigator.geolocation) return;
    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        position.current = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setNoLocation(false);
      },
      () => setNoLocation(true),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    return () => {
      if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    };
  }, [state?.online]);

  async function run(id: string, fn: () => Promise<PetTaxiDriverStateDto>, failure = t("failed")) {
    setBusy(id);
    setError(null);
    try {
      setState(await fn());
    } catch {
      setError(failure);
      void refresh();
    } finally {
      setBusy(null);
    }
  }

  if (!state) return <Skeleton className="h-64 w-full" aria-label={tm("loading")} />;
  if (!state.eligible)
    return (
      <div className="pet-taxi">
        <header className="pet-taxi__head">
          <h1>{t("title")}</h1>
          <p>{state.reason ? t(`notEligible.${state.reason}`) : null}</p>
        </header>
      </div>
    );

  const ride = state.activeRide;
  const next = ride ? NEXT[ride.status] : undefined;
  const target = ride && (ride.status === "PICKED_UP" ? ride.dropoff : ride.pickup);
  const nav = target ? navigationLinks(target) : null;
  const markers: MapMarker[] = ride
    ? [
        { id: "pickup", kind: "pickup", label: tm("pickup"), latitude: ride.pickup.latitude, longitude: ride.pickup.longitude },
        { id: "dropoff", kind: "dropoff", label: tm("dropoff"), latitude: ride.dropoff.latitude, longitude: ride.dropoff.longitude },
        ...(position.current ? [{ id: "me", kind: "driver" as const, label: tm("driver"), ...position.current }] : []),
      ]
    : [];

  return (
    <div className="pet-taxi">
      <header className="pet-taxi__head">
        <h1>{t("title")}</h1>
        <p>{t("subtitle")}</p>
      </header>
      <section className="pet-taxi__panel pet-taxi__switch">
        <span className={`pet-taxi__online ${state.online ? "is-on" : ""}`} role="status">
          {state.online ? t("online") : t("offline")}
        </span>
        <Button
          variant={state.online ? "secondary" : "primary"}
          isLoading={busy === "presence"}
          disabled={!!ride && state.online}
          onClick={() => void run("presence", () => petTaxiService.presence({ online: !state.online, ...(position.current ?? {}) }))}
        >
          {state.online ? t("goOffline") : t("goOnline")}
        </Button>
        {state.online && noLocation ? <p className="pet-taxi__muted">{t("locationOff")}</p> : null}
      </section>
      {error ? (
        <p role="alert" className="pet-taxi__error">
          {error}
        </p>
      ) : null}

      {ride ? (
        <section className="pet-taxi__panel" aria-labelledby="driver-ride">
          <div className="pet-taxi__status">
            <h2 id="driver-ride">{t("activeRide")}</h2>
            <StatusLabel tone="success">{tm(`status.${ride.status}`)}</StatusLabel>
          </div>
          <MapView center={target!} markers={markers} line={[ride.pickup, ride.dropoff]} label={tm("map")} zoomInLabel={tm("zoomIn")} zoomOutLabel={tm("zoomOut")} className="pet-taxi__map" />
          {ride.member ? (
            <div className="pet-taxi__driver">
              <div>
                <small>{t("passenger")}</small>
                <strong>{ride.member.name}</strong>
                {ride.pickup.note ? <small>{ride.pickup.note}</small> : null}
              </div>
              {ride.member.phone ? (
                <a className="pet-taxi__call" href={`tel:${ride.member.phone}`} dir="ltr">
                  {tm("call")}
                </a>
              ) : null}
            </div>
          ) : null}
          <ol className="pet-taxi__legs">
            <li>
              <span className="pet-taxi__dot pet-taxi__dot--pickup" aria-hidden />
              <span>
                <strong>{tm("pickup")}:</strong> {ride.pickup.label}
              </span>
            </li>
            <li>
              <span className="pet-taxi__dot pet-taxi__dot--dropoff" aria-hidden />
              <span>
                <strong>{tm("dropoff")}:</strong> {ride.dropoff.label}
              </span>
            </li>
          </ol>
          <p>
            {t("fare", { amount: formatCurrency(ride.fareIrr, locale) })} · {tm(`carrierSize.${ride.carrierSize}`)} · {t("pets", { count: ride.petIds.length })}
          </p>
          <p className="pet-taxi__muted">{t("collect")}</p>
          {nav ? (
            <div className="pet-taxi__nav" aria-label={t("navigate")}>
              <a href={nav.neshan} target="_blank" rel="noopener noreferrer">
                {t("navigate")}: Neshan
              </a>
              <a href={nav.google} target="_blank" rel="noopener noreferrer">
                Google Maps
              </a>
              <a href={nav.waze} target="_blank" rel="noopener noreferrer">
                Waze
              </a>
            </div>
          ) : null}
          <div className="pet-taxi__actions">
            {next ? (
              <Button size="lg" isLoading={busy === "advance"} onClick={() => void run("advance", () => petTaxiService.advance(ride.id, next))}>
                {t(`next.${next}`)}
              </Button>
            ) : null}
            {ride.status === "DRIVER_ASSIGNED" || ride.status === "ARRIVING" ? (
              <Button
                variant="ghost"
                isLoading={busy === "release"}
                onClick={() => {
                  const reason = window.prompt(t("releaseReason"));
                  if (reason && reason.trim().length >= 3) void run("release", () => petTaxiService.release(ride.id, reason.trim()));
                }}
              >
                {t("release")}
              </Button>
            ) : null}
          </div>
        </section>
      ) : state.online ? (
        <section className="pet-taxi__panel" aria-labelledby="driver-requests">
          <h2 id="driver-requests">{t("requests")}</h2>
          {state.requests.length === 0 ? <p className="pet-taxi__muted">{t("noRequests")}</p> : null}
          {state.requests.map((r) => (
            <article key={r.id} className="pet-taxi__request">
              <div className="pet-taxi__status">
                <strong>{formatCurrency(r.fareIrr, locale)}</strong>
                {r.kmFromYou != null ? <small>{t("kmFromYou", { km: r.kmFromYou })}</small> : null}
              </div>
              <ol className="pet-taxi__legs">
                <li>
                  <span className="pet-taxi__dot pet-taxi__dot--pickup" aria-hidden />
                  {r.pickup.label}
                </li>
                <li>
                  <span className="pet-taxi__dot pet-taxi__dot--dropoff" aria-hidden />
                  {r.dropoff.label}
                </li>
              </ol>
              <small>
                {tm("distanceTime", { km: (r.distanceMeters / 1000).toFixed(1), minutes: Math.round(r.durationSeconds / 60) })} · {tm(`carrierSize.${r.carrierSize}`)} · {t("pets", { count: r.petCount })}
              </small>
              <div className="pet-taxi__actions">
                <Button isLoading={busy === r.id} onClick={() => void run(r.id, () => petTaxiService.accept(r.id), t("taken"))}>
                  {t("accept")}
                </Button>
                <Button variant="ghost" onClick={() => void run(`d-${r.id}`, () => petTaxiService.decline(r.id))}>
                  {t("decline")}
                </Button>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
