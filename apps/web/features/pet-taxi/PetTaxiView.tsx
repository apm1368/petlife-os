"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { CustomerAddressDto, MapPlaceDto, PetDto, PetTaxiCarrierSizeValue, PetTaxiPointDto, PetTaxiQuoteDto, PetTaxiRideDto } from "@petlife/types";
import { Button, LocateFixed, Search, Skeleton, StatusLabel } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import type { RouteLocale } from "@/lib/i18n/config";
import { addressesService } from "@/services/addresses.service";
import { householdsService } from "@/services/households.service";
import { petTaxiService } from "@/services/pet-taxi.service";
import { MapView, useMapsConfig, type MapMarker, type MapPoint } from "@/features/maps/MapView";
import "./pet-taxi.css";

const OPEN: PetTaxiRideDto["status"][] = ["SEARCHING", "DRIVER_ASSIGNED", "ARRIVING", "PICKED_UP"];
const SIZES: PetTaxiCarrierSizeValue[] = ["SMALL", "MEDIUM", "LARGE"];
/** Tehran (Azadi square) until the member's location or a saved address says otherwise. */
const DEFAULT_CENTER: MapPoint = { latitude: 35.6997, longitude: 51.338 };
const POLL_MS = 5_000;

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const reasonOf = (e: unknown) => (e instanceof ApiError ? String((e.details as { reason?: string } | undefined)?.reason ?? "") : "");

/**
 * Member pet taxi, like a ride-hailing app: tap pickup and destination (or use current location, a saved address or
 * place search), choose pets and how they travel, see the server's fare, request, then follow the driver live.
 */
export function PetTaxiView() {
  const t = useTranslations("petTaxi.member");
  const [rides, setRides] = useState<PetTaxiRideDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [current, setCurrent] = useState<PetTaxiRideDto | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const list = await petTaxiService.rides();
      setRides(list);
      setCurrent(list.find((r) => OPEN.includes(r.status)) ?? null);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed)
    return (
      <div className="pet-taxi" role="alert">
        <p>{t("failed")}</p>
        <Button onClick={() => void load()}>{t("retry")}</Button>
      </div>
    );
  if (!rides) return <Skeleton className="h-96 w-full" aria-label={t("loading")} />;

  return (
    <div className="pet-taxi">
      <header className="pet-taxi__head">
        <h1>{t("title")}</h1>
        <p>{t("subtitle")}</p>
      </header>
      {current ? (
        <RideTracker
          ride={current}
          onChange={(r) => {
            setCurrent(r);
            setRides((list) => (list ?? []).map((x) => (x.id === r.id ? r : x)));
          }}
          onDone={() => {
            setCurrent(null);
            void load();
          }}
        />
      ) : (
        <RideRequest
          onRequested={(r) => {
            setCurrent(r);
            setRides((list) => [r, ...(list ?? [])]);
          }}
        />
      )}
      <History rides={rides.filter((r) => !OPEN.includes(r.status))} onRated={(r) => setRides((list) => (list ?? []).map((x) => (x.id === r.id ? r : x)))} />
    </div>
  );
}

type Pick = PetTaxiPointDto & { source: "map" | "location" | "address" | "search" };

function RideRequest({ onRequested }: { onRequested: (r: PetTaxiRideDto) => void }) {
  const t = useTranslations("petTaxi.member");
  const locale = useLocale() as RouteLocale;
  const config = useMapsConfig();
  const [center, setCenter] = useState<MapPoint>(DEFAULT_CENTER);
  const [pickup, setPickup] = useState<Pick | null>(null);
  const [dropoff, setDropoff] = useState<Pick | null>(null);
  const [city, setCity] = useState("");
  const [note, setNote] = useState("");
  const [pets, setPets] = useState<PetDto[] | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddressDto[]>([]);
  const [petIds, setPetIds] = useState<string[]>([]);
  const [size, setSize] = useState<PetTaxiCarrierSizeValue>("SMALL");
  const [quote, setQuote] = useState<PetTaxiQuoteDto | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const key = useRef(newKey());
  const stage: "pickup" | "dropoff" | "details" = !pickup ? "pickup" : !dropoff ? "dropoff" : "details";

  useEffect(() => {
    void (async () => {
      try {
        const households = await householdsService.listMine();
        const id = households[0]?.id;
        if (!id) return setPets([]);
        const [p, a] = await Promise.all([householdsService.listPets(id), addressesService.list(id)]);
        setPets(p);
        setPetIds(p[0] ? [p[0].id] : []);
        setAddresses(a.filter((x) => x.latitude != null && x.longitude != null));
        const home = a.find((x) => x.isDefault && x.latitude != null && x.longitude != null);
        if (home) {
          setCenter({ latitude: home.latitude!, longitude: home.longitude! });
          setCity(home.city);
        }
      } catch {
        setPets([]);
      }
    })();
  }, []);

  // A fresh server quote whenever the trip changes; the client never sends a price.
  useEffect(() => {
    if (!pickup || !dropoff || !petIds.length) return setQuote(null);
    let alive = true;
    setQuoting(true);
    setError(null);
    petTaxiService
      .quote({ pickup: { ...pickup, city: city || pickup.city || null }, dropoff, carrierSize: size, petCount: petIds.length })
      .then((q) => alive && setQuote(q))
      .catch((e) => alive && setError(t.has(`errors.${reasonOf(e)}`) ? t(`errors.${reasonOf(e)}`) : t("errors.generic")))
      .finally(() => alive && setQuoting(false));
    return () => {
      alive = false;
    };
  }, [pickup, dropoff, size, petIds.length, city, t]);

  const place = (p: Pick) => {
    setCenter({ latitude: p.latitude, longitude: p.longitude });
    if (stage === "pickup") {
      setPickup(p);
      if (p.city) setCity(p.city);
    } else if (stage === "dropoff") setDropoff(p);
  };

  function locate() {
    if (!navigator.geolocation) return setError(t("locationDenied"));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        place({ label: t("myLocation"), latitude: pos.coords.latitude, longitude: pos.coords.longitude, source: "location" });
      },
      () => {
        setLocating(false);
        setError(t("locationDenied"));
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  async function request() {
    if (!pickup || !dropoff || !petIds.length) return;
    setBusy(true);
    setError(null);
    try {
      const ride = await petTaxiService.request({ pickup: { label: pickup.label, latitude: pickup.latitude, longitude: pickup.longitude, city: city || pickup.city || null, note: note.trim() || null }, dropoff: { label: dropoff.label, latitude: dropoff.latitude, longitude: dropoff.longitude }, carrierSize: size, petIds }, key.current);
      key.current = newKey();
      onRequested(ride);
    } catch (e) {
      key.current = newKey();
      const r = reasonOf(e);
      setError(t.has(`errors.${r}`) ? t(`errors.${r}`) : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  const markers: MapMarker[] = [
    ...(pickup ? [{ id: "pickup", kind: "pickup" as const, label: t("pickup"), latitude: pickup.latitude, longitude: pickup.longitude }] : []),
    ...(dropoff ? [{ id: "dropoff", kind: "dropoff" as const, label: t("dropoff"), latitude: dropoff.latitude, longitude: dropoff.longitude }] : []),
  ];

  return (
    <section className="pet-taxi__panel" aria-labelledby="pet-taxi-step">
      <h2 id="pet-taxi-step">{t(`step.${stage}`)}</h2>
      <MapView
        center={center}
        markers={markers}
        line={pickup && dropoff ? [pickup, dropoff] : null}
        onPick={stage === "details" ? undefined : (p) => place({ label: t("pinned"), latitude: p.latitude, longitude: p.longitude, source: "map" })}
        label={t("map")}
        zoomInLabel={t("zoomIn")}
        zoomOutLabel={t("zoomOut")}
        className="pet-taxi__map"
      />

      {stage !== "details" ? (
        <div className="pet-taxi__pickers">
          <Button variant="secondary" size="sm" onClick={locate} isLoading={locating}>
            <LocateFixed size={16} aria-hidden /> {locating ? t("locating") : t("myLocation")}
          </Button>
          {addresses.length ? (
            <label className="pet-taxi__select">
              <span>{t("savedAddresses")}</span>
              <select
                value=""
                onChange={(e) => {
                  const a = addresses.find((x) => x.id === e.target.value);
                  if (a) place({ label: a.label || a.addressLine, latitude: a.latitude!, longitude: a.longitude!, city: a.city, source: "address" });
                }}
              >
                <option value="">—</option>
                {addresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label || a.addressLine}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {config?.search ? <PlaceSearch near={center} onPick={(p) => place({ label: p.label, latitude: p.latitude, longitude: p.longitude, city: p.city, source: "search" })} /> : null}
        </div>
      ) : null}

      <ol className="pet-taxi__legs">
        {pickup ? (
          <li>
            <span className="pet-taxi__dot pet-taxi__dot--pickup" aria-hidden />
            <span>
              <strong>{t("pickup")}:</strong> {pickup.label}
            </span>
            <button type="button" className="pet-taxi__link" onClick={() => {
                setPickup(null);
                setDropoff(null);
              }}>
              {t("change")}
            </button>
          </li>
        ) : null}
        {dropoff ? (
          <li>
            <span className="pet-taxi__dot pet-taxi__dot--dropoff" aria-hidden />
            <span>
              <strong>{t("dropoff")}:</strong> {dropoff.label}
            </span>
            <button type="button" className="pet-taxi__link" onClick={() => setDropoff(null)}>
              {t("change")}
            </button>
          </li>
        ) : null}
      </ol>

      {stage === "details" ? (
        <div className="pet-taxi__details">
          <label className="pet-taxi__field">
            <span>{t("city")}</span>
            <input value={city} maxLength={120} onChange={(e) => setCity(e.target.value)} />
          </label>
          <label className="pet-taxi__field">
            <span>{t("note")}</span>
            <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          </label>
          <fieldset className="pet-taxi__choices">
            <legend>{t("pets")}</legend>
            {pets === null ? <Skeleton className="h-10 w-full" /> : pets.length === 0 ? <p>{t("noPets")}</p> : null}
            {(pets ?? []).map((p) => (
              <label key={p.id} className={petIds.includes(p.id) ? "is-selected" : undefined}>
                <input type="checkbox" checked={petIds.includes(p.id)} onChange={(e) => setPetIds((ids) => (e.target.checked ? [...ids, p.id].slice(0, 3) : ids.filter((x) => x !== p.id)))} />
                {p.name}
              </label>
            ))}
          </fieldset>
          <fieldset className="pet-taxi__choices pet-taxi__choices--stack">
            <legend>{t("carrier")}</legend>
            {SIZES.map((s) => (
              <label key={s} className={size === s ? "is-selected" : undefined}>
                <input type="radio" name="carrier" checked={size === s} onChange={() => setSize(s)} />
                {t(`carrierSize.${s}`)}
              </label>
            ))}
          </fieldset>
          <div className="pet-taxi__quote" aria-live="polite">
            {quoting ? (
              <p>{t("quoting")}</p>
            ) : quote && !quote.available ? (
              <p>{t("notPriced")}</p>
            ) : quote?.fareIrr ? (
              <>
                <p className="pet-taxi__fare">
                  {t("quote")}: <strong>{formatCurrency(quote.fareIrr, locale)}</strong>
                </p>
                <p>{t("distanceTime", { km: (quote.distanceMeters / 1000).toFixed(1), minutes: Math.round(quote.durationSeconds / 60) })}</p>
                <p className="pet-taxi__muted">{quote.routeSource === "STRAIGHT_LINE_ESTIMATE" ? t("estimate") : t("routed")}</p>
                <p className="pet-taxi__muted">{t("payNote")}</p>
              </>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="pet-taxi__error">
              {error}
            </p>
          ) : null}
          <Button onClick={() => void request()} isLoading={busy} disabled={!quote?.available || !petIds.length || quoting}>
            {busy ? t("requesting") : t("request")}
          </Button>
        </div>
      ) : error ? (
        <p role="alert" className="pet-taxi__error">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function PlaceSearch({ near, onPick }: { near: MapPoint; onPick: (p: MapPlaceDto) => void }) {
  const t = useTranslations("petTaxi.member");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MapPlaceDto[] | null>(null);
  return (
    <form
      className="pet-taxi__search"
      role="search"
      onSubmit={async (e) => {
        e.preventDefault();
        if (q.trim().length < 2) return;
        try {
          setResults(await petTaxiService.search(q.trim(), near));
        } catch {
          setResults([]);
        }
      }}
    >
      <label className="pet-taxi__field">
        <span>{t("search")}</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <Button type="submit" variant="secondary" size="sm">
        <Search size={16} aria-hidden />
        <span className="sr-only">{t("search")}</span>
      </Button>
      {results ? (
        <ul className="pet-taxi__results">
          {results.length === 0 ? <li>{t("searchNone")}</li> : null}
          {results.map((r, i) => (
            <li key={`${r.latitude},${r.longitude},${i}`}>
              <button
                type="button"
                onClick={() => {
                  onPick(r);
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
    </form>
  );
}

function RideTracker({ ride, onChange, onDone }: { ride: PetTaxiRideDto; onChange: (r: PetTaxiRideDto) => void; onDone: () => void }) {
  const t = useTranslations("petTaxi.member");
  const locale = useLocale() as RouteLocale;
  const [busy, setBusy] = useState(false);
  const time = useCallback((iso: string) => new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : locale, { timeStyle: "short" }).format(new Date(iso)), [locale]);

  // Live: the driver's phone reports its position; this page asks for it every few seconds while the ride is open.
  useEffect(() => {
    if (!OPEN.includes(ride.status)) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      petTaxiService.ride(ride.id).then(onChange).catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [ride.id, ride.status, onChange]);

  const driverPoint = ride.driver?.latitude != null && ride.driver.longitude != null ? { latitude: ride.driver.latitude, longitude: ride.driver.longitude } : null;
  const markers: MapMarker[] = [
    { id: "pickup", kind: "pickup", label: t("pickup"), latitude: ride.pickup.latitude, longitude: ride.pickup.longitude },
    { id: "dropoff", kind: "dropoff", label: t("dropoff"), latitude: ride.dropoff.latitude, longitude: ride.dropoff.longitude },
    ...(driverPoint ? [{ id: "driver", kind: "driver" as const, label: t("driver"), ...driverPoint }] : []),
  ];
  const center = useMemo(() => driverPoint ?? { latitude: ride.pickup.latitude, longitude: ride.pickup.longitude }, [driverPoint?.latitude, driverPoint?.longitude, ride.pickup.latitude, ride.pickup.longitude]); // eslint-disable-line react-hooks/exhaustive-deps
  const cancellable = ["SEARCHING", "DRIVER_ASSIGNED", "ARRIVING"].includes(ride.status);

  return (
    <section className="pet-taxi__panel" aria-labelledby="pet-taxi-ride">
      <div className="pet-taxi__status">
        <h2 id="pet-taxi-ride">{t(`status.${ride.status}`)}</h2>
        <StatusLabel tone={ride.status === "SEARCHING" ? "attention" : "success"}>{formatCurrency(ride.fareIrr, locale)}</StatusLabel>
      </div>
      <MapView center={center} markers={markers} line={[ride.pickup, ride.dropoff]} label={t("map")} zoomInLabel={t("zoomIn")} zoomOutLabel={t("zoomOut")} className="pet-taxi__map" />
      {ride.status === "SEARCHING" ? <p className="pet-taxi__muted" role="status">{t("searchingHint", { time: time(ride.searchExpiresAt) })}</p> : null}
      {ride.etaSeconds != null ? <p role="status">{t("eta", { minutes: Math.max(1, Math.round(ride.etaSeconds / 60)) })}</p> : null}
      {ride.driver ? (
        <div className="pet-taxi__driver">
          <div>
            <strong>{ride.driver.name}</strong>
            <small>{ride.driver.organizationName}</small>
            {ride.driver.locatedAt ? <small>{t("positionAt", { time: time(ride.driver.locatedAt) })}</small> : null}
          </div>
          {ride.driver.phone ? (
            <a className="pet-taxi__call" href={`tel:${ride.driver.phone}`} dir="ltr">
              {t("call")}
            </a>
          ) : null}
        </div>
      ) : null}
      <ol className="pet-taxi__legs">
        <li>
          <span className="pet-taxi__dot pet-taxi__dot--pickup" aria-hidden />
          <span>
            <strong>{t("pickup")}:</strong> {ride.pickup.label}
          </span>
        </li>
        <li>
          <span className="pet-taxi__dot pet-taxi__dot--dropoff" aria-hidden />
          <span>
            <strong>{t("dropoff")}:</strong> {ride.dropoff.label}
          </span>
        </li>
      </ol>
      <p className="pet-taxi__muted">{t("payNote")}</p>
      <div className="pet-taxi__actions">
        {cancellable ? (
          <Button
            variant="ghost"
            isLoading={busy}
            onClick={async () => {
              if (!window.confirm(t("cancelConfirm"))) return;
              setBusy(true);
              try {
                onChange(await petTaxiService.cancel(ride.id));
                onDone();
              } catch {
                /* The next poll shows the real state. */
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("cancel")}
          </Button>
        ) : null}
        {!OPEN.includes(ride.status) ? <Button onClick={onDone}>{t("newRide")}</Button> : null}
      </div>
    </section>
  );
}

function History({ rides, onRated }: { rides: PetTaxiRideDto[]; onRated: (r: PetTaxiRideDto) => void }) {
  const t = useTranslations("petTaxi.member");
  const locale = useLocale() as RouteLocale;
  const money = (irr: number) => formatCurrency(irr, locale);
  return (
    <section className="pet-taxi__panel" aria-labelledby="pet-taxi-history">
      <h2 id="pet-taxi-history">{t("history")}</h2>
      {rides.length === 0 ? <p className="pet-taxi__muted">{t("historyEmpty")}</p> : null}
      <ul className="pet-taxi__history">
        {rides.map((r) => (
          <li key={r.id}>
            <div className="pet-taxi__status">
              <strong>
                {r.pickup.label} → {r.dropoff.label}
              </strong>
              <StatusLabel tone={r.status === "COMPLETED" ? "success" : "neutral"}>{t(`status.${r.status}`)}</StatusLabel>
            </div>
            <small>{new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(r.createdAt))}</small>
            {r.status === "COMPLETED" ? (
              <details>
                <summary>{t("receipt")}</summary>
                <dl className="pet-taxi__receipt">
                  <div><dt>{t("receiptLines.base")}</dt><dd>{money(r.breakdown.baseIrr)}</dd></div>
                  <div><dt>{t("receiptLines.distance")} ({r.breakdown.km} km)</dt><dd>{money(r.breakdown.distanceIrr)}</dd></div>
                  {r.breakdown.timeIrr ? <div><dt>{t("receiptLines.time")}</dt><dd>{money(r.breakdown.timeIrr)}</dd></div> : null}
                  {r.breakdown.carrierIrr ? <div><dt>{t("receiptLines.carrier")}</dt><dd>{money(r.breakdown.carrierIrr)}</dd></div> : null}
                  {r.breakdown.extraPetsIrr ? <div><dt>{t("receiptLines.extraPets")}</dt><dd>{money(r.breakdown.extraPetsIrr)}</dd></div> : null}
                  {r.breakdown.minimumApplied ? <div><dt>{t("receiptLines.minimum")}</dt><dd /></div> : null}
                  <div className="pet-taxi__total"><dt>{t("receiptLines.total")}</dt><dd>{money(r.fareIrr)}</dd></div>
                </dl>
              </details>
            ) : null}
            {r.status === "COMPLETED" && r.rating == null ? <RateRide ride={r} onRated={onRated} /> : null}
            {r.rating != null ? <small>★ {t("stars", { n: r.rating })}</small> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RateRide({ ride, onRated }: { ride: PetTaxiRideDto; onRated: (r: PetTaxiRideDto) => void }) {
  const t = useTranslations("petTaxi.member");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="pet-taxi__rate">
      <span>{t("rate")}</span>
      <div role="radiogroup" aria-label={t("rate")} className="pet-taxi__stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={t("stars", { n })} onClick={() => setRating(n)} className={n <= rating ? "is-on" : undefined}>
            ★
          </button>
        ))}
      </div>
      <input aria-label={t("rateComment")} placeholder={t("rateComment")} value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} />
      <Button
        size="sm"
        isLoading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            onRated(await petTaxiService.rate(ride.id, rating, comment.trim() || undefined));
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("rateSend")}
      </Button>
    </div>
  );
}
