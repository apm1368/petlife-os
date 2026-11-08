"use client";

import Link from "next/link";
import { randomId } from "@/lib/id/random-id";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Avatar, Button, ContextSurface, EmptyState, ErrorRecovery, ShieldCheck, Skeleton, Timer } from "@petlife/ui";
import type { AvailabilitySlotDto, BookingHoldDto, CustomerAddressDto, PetDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { discoveryService, type ProviderProfile } from "@/services/discovery.service";
import { servicesService } from "@/services/services.service";
import { bookingsService } from "@/services/bookings.service";
import { householdsService } from "@/services/households.service";
import { addressesService } from "@/services/addresses.service";
import { useSessionStore } from "@/stores/session-store";
import { usePetStore } from "@/stores/pet-store";
import { DateField } from "@/features/shared/date-picker/DateField";
import { DateRangeField } from "@/features/shared/date-picker/DateRangePicker";
import { BackLink } from "@/features/shared/BackLink";
import { Stepper } from "@/features/shared/Stepper";
import { BookingFrame } from "@/features/bookings/BookingFrame";
import { formatDay } from "@/lib/date/jalali";
import type { RouteLocale } from "@/lib/i18n/config";

type Step = "service" | "pets" | "time" | "details" | "review";
const STEPS: Step[] = ["service", "pets", "time", "details", "review"];
const RANGE_CATEGORIES = ["SITTING", "BOARDING"];
const CATEGORIES = ["VET", "GROOMING", "WALKING", "SITTING", "BOARDING", "TRAINING", "PET_TAXI", "OTHER"] as const;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * TRANSACTION / BOOKING PATTERN: one flow for every category. Anonymous visitors can choose a
 * service and see real availability; sign-in is required only when a slot is held, and the URL
 * (service, option, date) is preserved through sign-in. The review step shows every term that is
 * frozen into the booking — price, deposit, policy, preparation and shared health scope — and the
 * hold countdown. The server decides the outcome (confirmed, request sent, or awaiting payment).
 */
export function BookingFlowView({ providerId }: { providerId: string }) {
  const locale = useLocale() as RouteLocale;
  const fa = locale === "fa";
  const t = useTranslations("bookingFlow");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const session = useSessionStore((s) => s.status);
  const activePetId = usePetStore((s) => s.activePetId);
  const dateLocale = locale === "fa" ? "fa-IR-u-ca-persian" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : "en-GB";
  const formatPrice = (amountRial: number) => `${Math.round(amountRial / 10).toLocaleString(dateLocale)} ${t("currencyUnit")}`;
  const formatDuration = (minutes: number) => t("duration", { count: minutes });
  const paymentLabel = (mode: string) => t(`paymentMode.${mode}` as never);
  const categoryName = (category: string) => t(`categories.${category}` as never);
  const bookingError = (e: unknown) => {
    const code = e instanceof ApiError ? e.code : "";
    const errorKeys: Record<string, string> = {
      SLOT_UNAVAILABLE: "slotUnavailable",
      BOOKING_CONFLICT: "slotUnavailable",
      HOLD_EXPIRED: "holdExpired",
      PET_NOT_SUPPORTED: "petNotSupported",
      PET_CONTEXT_INCOMPLETE: "petContextIncomplete",
      ADDRESS_REQUIRED: "addressRequired",
      PET_ACCESS_DENIED: "petAccessDenied",
      INVALID_BOOKING_TRANSITION: "bookingChanged",
    };
    if (e instanceof ApiError && e.status === 429) return t("errors.tooManyRequests");
    return errorKeys[code] ? t(`errors.${errorKeys[code]}` as never) : t("errors.generic");
  };

  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "notFound" | "error">("loading");
  const [step, setStep] = useState<Step>(params.get("serviceId") ? "pets" : "service");
  const [serviceId, setServiceId] = useState<string | null>(params.get("serviceId"));
  const [variantId, setVariantId] = useState<string | null>(params.get("variantId"));
  const [pets, setPets] = useState<PetDto[] | null>(null);
  const [petHouseholdIds, setPetHouseholdIds] = useState<Record<string, string>>({});
  const [petIds, setPetIds] = useState<string[]>([]);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(params.get("date") ?? dayKey(new Date()));
  const [rangeEnd, setRangeEnd] = useState<string>("");
  const [slots, setSlots] = useState<AvailabilitySlotDto[] | null>(null);
  const [slot, setSlot] = useState<AvailabilitySlotDto | null>(null);
  const [hold, setHold] = useState<BookingHoldDto | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [intake, setIntake] = useState("");
  const [healthShare, setHealthShare] = useState<"MINIMAL_VET_CONTEXT" | "HEALTH_BASICS" | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddressDto[] | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [dropoffId, setDropoffId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waitlisted, setWaitlisted] = useState(false);
  const [idempotencyKey] = useState(() => randomId());

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      setProfile(await discoveryService.profile(providerId));
      setLoadState("ready");
    } catch (e) {
      setLoadState(e instanceof ApiError && e.status === 404 ? "notFound" : "error");
    }
  }, [providerId]);
  useEffect(() => void load(), [load]);

  const service = profile?.services.find((s) => s.id === serviceId) ?? null;
  const variant = service?.variants.find((v) => v.id === variantId) ?? null;
  const isRange = service ? RANGE_CATEGORIES.includes(service.category) : false;
  const locationId = service?.locationId ?? profile?.locations[0]?.id ?? null;
  const needsAddress = service ? service.locationMode !== "AT_PROVIDER" : false;
  const selectedHouseholdId = petIds[0] ? petHouseholdIds[petIds[0]] : null;
  const qualifiedStaff = useMemo(() => (profile && service ? profile.team.filter((m) => !service.staffIds.length || service.staffIds.includes(m.providerUserId)) : []), [profile, service]);

  useEffect(() => {
    if (step !== "details" || !needsAddress) return;
    if (!selectedHouseholdId) {
      setAddresses([]);
      setAddressId(null);
      return;
    }
    let current = true;
    setAddresses(null);
    void addressesService.list(selectedHouseholdId).then((list) => {
      if (!current) return;
      setAddresses(list);
      setAddressId((existing) => (existing && list.some((address) => address.id === existing) ? existing : null));
    }).catch(() => {
      if (current) setError(t("errors.addressesLoadFailed"));
    });
    return () => { current = false; };
  }, [step, needsAddress, selectedHouseholdId, t]);

  // Keep service/variant/date in the URL so sign-in (returnTo) and refresh resume the same choice.
  useEffect(() => {
    const next = new URLSearchParams();
    if (serviceId) next.set("serviceId", serviceId);
    if (variantId) next.set("variantId", variantId);
    if (date) next.set("date", date);
    router.replace(`${pathname}?${next}`, { scroll: false });
  }, [serviceId, variantId, date, pathname, router]);

  const requireSession = useCallback(() => {
    if (session === "authenticated") return true;
    router.push(`/${locale}/welcome?returnTo=${encodeURIComponent(`${pathname}?${params.toString()}`)}`);
    return false;
  }, [session, router, locale, pathname, params]);

  useEffect(() => {
    if (step !== "pets" || session !== "authenticated" || pets) return;
    void (async () => {
      try {
        const households = await householdsService.listMine();
        const grouped = await Promise.all(households.map(async (household) => ({ householdId: household.id, pets: await householdsService.listPets(household.id) })));
        const petHouseholdMap = Object.fromEntries(grouped.flatMap(({ householdId, pets: householdPets }) => householdPets.map((pet) => [pet.id, householdId])));
        const all = [...new Map(grouped.flatMap(({ pets: householdPets }) => householdPets).map((pet) => [pet.id, pet])).values()];
        setPets(all);
        setPetHouseholdIds(petHouseholdMap);
        const preferred = all.find((pet) => pet.id === activePetId);
        if (preferred) setPetIds([preferred.id]);
        else if (all.length === 1) setPetIds([all[0]!.id]);
      } catch {
        setError(t("errors.petsLoadFailed"));
      }
    })();
  }, [step, session, pets, t, activePetId]);

  useEffect(() => {
    if (step !== "time" || !service || !locationId || isRange) return;
    setSlots(null);
    setSlot(null);
    const from = new Date(`${date}T00:00:00Z`);
    const to = new Date(from.getTime() + 86400_000);
    void servicesService
      .getAvailability(service.id, { locationId, from: (from < new Date() ? new Date() : from).toISOString(), to: to.toISOString(), variantId: variantId ?? undefined, providerUserId: staffId ?? undefined, petId: petIds[0] })
      .then((res) => setSlots(res.slots))
      .catch(() => setSlots([]));
  }, [step, service, locationId, date, variantId, staffId, petIds, isRange]);

  useEffect(() => {
    if (!hold) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hold]);
  const holdSecondsLeft = hold ? Math.max(0, Math.floor((new Date(hold.expiresAt).getTime() - now) / 1000)) : 0;
  const holdExpired = Boolean(hold) && holdSecondsLeft === 0;

  if (loadState === "loading") return <Skeleton className="h-96 w-full" aria-label={t("loading")} />;
  if (loadState === "notFound") return <EmptyState title={t("notBookable")} />;
  if (loadState === "error" || !profile) return <ErrorRecovery title={t("loadFailed")} message="" retryLabel={t("retry")} onRetry={load} />;

  const unitPrice = variant?.priceAmount ?? service?.priceAmount ?? null;
  const total = unitPrice === null ? null : unitPrice * Math.max(1, petIds.length);
  const fmtDateTime = (iso: string, tz?: string) => new Intl.DateTimeFormat(dateLocale, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: tz ?? "Asia/Tehran" }).format(new Date(iso));
  const fmtDay = (day: string) => fa ? formatDay(day, "fa") : new Intl.DateTimeFormat(dateLocale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
  const isSupportedForService = (pet: PetDto) => !service || (service.supportedSpecies
    ? service.supportedSpecies.includes(pet.species)
    : pet.species === "DOG" ? service.supportsDog : pet.species === "CAT" ? service.supportsCat : false);

  async function createHold() {
    if (!service || !locationId || !requireSession()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await bookingsService.createHold({
        petId: petIds[0]!,
        additionalPetIds: petIds.slice(1),
        providerId,
        locationId,
        serviceId: service.id,
        variantId: variantId ?? undefined,
        providerUserId: staffId ?? slot?.providerUserId ?? undefined,
        ...(isRange ? { rangeStart: new Date(`${date}T12:00:00Z`).toISOString(), rangeEnd: new Date(`${rangeEnd}T12:00:00Z`).toISOString() } : { slotStart: slot!.startAt }),
      });
      setHold(created);
      setNow(Date.now());
      setStep("details");
    } catch (e) {
      setError(bookingError(e));
      if (e instanceof ApiError && e.code === "SLOT_UNAVAILABLE") {
        setSlots((prev) => prev?.map((s) => (s.startAt === slot?.startAt ? { ...s, state: "BOOKED" } : s)) ?? null);
        // The taken time must not linger in the summary or keep "Hold" enabled.
        setSlot(null);
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!hold) return;
    setBusy(true);
    setError(null);
    try {
      const booking = await bookingsService.confirm(
        { holdId: hold.holdId, petId: petIds[0]!, reasonForVisit: intake.trim() || undefined, accessSelection: service?.category === "VET" && healthShare ? healthShare : undefined, customerAddressId: addressId ?? undefined, dropoffAddressId: dropoffId ?? undefined } as never,
        idempotencyKey,
      );
      router.push(`/${locale}/bookings/${booking.id}?created=1`);
    } catch (e) {
      setError(bookingError(e));
      setBusy(false);
    }
  }

  async function joinWaitlist() {
    if (!service || !requireSession() || !petIds[0]) return;
    try {
      await bookingsService.joinWaitlist({ petId: petIds[0], providerId, serviceId: service.id, variantId: variantId ?? undefined, windowStart: new Date(`${date}T00:00:00Z`).toISOString(), windowEnd: new Date(`${date}T23:59:59Z`).toISOString() });
      setWaitlisted(true);
    } catch (e) {
      setError(bookingError(e));
    }
  }

  const stepIndex = STEPS.indexOf(step);
  const canContinue: Record<Step, boolean> = {
    service: Boolean(service && (!service.variants.length || variant)),
    pets: petIds.length > 0 && petIds.length <= (service?.maxPetsPerBooking ?? 1) && pets?.filter((pet) => petIds.includes(pet.id)).every(isSupportedForService) === true,
    time: isRange ? Boolean(rangeEnd && rangeEnd > date) : Boolean(slot),
    details: (!needsAddress || Boolean(addressId)) && (service?.locationMode !== "TRANSPORT" || Boolean(dropoffId)) && (service?.category !== "VET" || healthShare !== null) && !holdExpired,
    review: Boolean(hold) && !holdExpired,
  };

  return (
    <BookingFrame journey>
    <div className="flow-layout">
    <div className="flow-main">
      <header className="flex flex-col gap-3">
        <BackLink href={`/${locale}/providers/${providerId}`} label={profile.name} />
        <h1 className="text-page-title">{t("pageTitle")}</h1>
        <Stepper steps={STEPS.map((s) => t(`steps.${s}` as never))} current={stepIndex} label={t("stepsLabel")} />
      </header>

      {hold && step !== "review" && step !== "details" ? null : hold ? (
        <p role="status" className={`inline-flex items-center gap-2 text-sm ${holdExpired ? "text-state-urgent" : "text-text-secondary"}`}>
          <Timer size={16} aria-hidden="true" />
          {holdExpired
            ? t("holdExpired")
            : t("holdCountdown", { time: `${Math.floor(holdSecondsLeft / 60).toLocaleString(locale)}:${(holdSecondsLeft % 60).toLocaleString(locale, { minimumIntegerDigits: 2 })}` })}
          {holdExpired ? <button type="button" className="font-bold text-brand-natural" onClick={() => { setHold(null); setStep("time"); }}>{t("chooseAgain")}</button> : null}
        </p>
      ) : null}

      {error ? <p role="alert" className="text-state-urgent">{error}</p> : null}

      {step === "service" ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 font-bold">{t("whichService")}</legend>
          {profile.services.map((s) => (
            <label key={s.id} className={`flex cursor-pointer flex-col gap-1 rounded-md border p-4 ${s.id === serviceId ? "border-brand-natural" : "border-border-subtle"}`}>
              <span className="flex items-center gap-3"><input type="radio" name="service" checked={s.id === serviceId} onChange={() => { setServiceId(s.id); setVariantId(null); }} /><span className="font-bold">{s.name}</span></span>
              <span className="text-sm text-text-secondary">{categoryName(s.category)} · {formatDuration(s.durationMinutes)} · {s.startingPrice ? formatPrice(s.startingPrice) : t("priceOnRequest")}</span>
            </label>
          ))}
          {service?.variants.length ? (
            <fieldset className="flex flex-col gap-2 border-s-2 border-brand-natural ps-4">
              <legend className="mb-2 font-bold">{t("option")}</legend>
              {service.variants.map((v) => (
                <label key={v.id} className="flex items-center gap-3">
                  <input type="radio" name="variant" checked={v.id === variantId} onChange={() => setVariantId(v.id)} />
                  <span>{v.name} · {formatDuration(v.durationMinutes)}{v.priceAmount !== null ? ` · ${formatPrice(v.priceAmount)}` : ""}</span>
                </label>
              ))}
            </fieldset>
          ) : null}
        </fieldset>
      ) : null}

      {step === "pets" ? (
        session !== "authenticated" ? (
          <ContextSurface className="flex flex-col gap-3">
            <p>{t("signInPrompt")}</p>
            <Button onClick={() => requireSession()}>{t("signInContinue")}</Button>
          </ContextSurface>
        ) : !pets ? (
          <Skeleton className="h-32 w-full" />
        ) : pets.length === 0 ? (
          <EmptyState title={t("noPetsTitle")} actionLabel={t("addPet")} onAction={() => router.push(`/${locale}/pets/new`)} />
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-bold">{service && service.maxPetsPerBooking > 1 ? t("chooseUpToPets", { count: service.maxPetsPerBooking }) : t("whichPet")}</legend>
            <p className="mb-2 text-sm text-text-secondary">{t("petSelectionInfo", { count: service?.maxPetsPerBooking ?? 1 })}</p>
            {pets.map((p) => {
              const supported = isSupportedForService(p);
              const multi = (service?.maxPetsPerBooking ?? 1) > 1;
              const maxSelected = service?.maxPetsPerBooking ?? 1;
              const limitReached = petIds.length >= maxSelected && !petIds.includes(p.id);
              const selectedHouseholdId = petIds[0] ? petHouseholdIds[petIds[0]] : null;
              const differentHousehold = Boolean(multi && selectedHouseholdId && petHouseholdIds[p.id] !== selectedHouseholdId && !petIds.includes(p.id));
              return (
                <label key={p.id} className={`flex min-h-16 items-center gap-3 rounded-md border p-3 ${petIds.includes(p.id) ? "border-brand-natural bg-surface-subtle" : "border-border-subtle"} ${supported ? "" : "opacity-60"}`}>
                  <input type={multi ? "checkbox" : "radio"} name="pet" disabled={!supported || limitReached || differentHousehold} checked={petIds.includes(p.id)} onChange={(e) => setPetIds((prev) => (multi ? (e.target.checked ? (prev.length < maxSelected ? [...prev, p.id] : prev) : prev.filter((id) => id !== p.id)) : [p.id]))} />
                  <Avatar name={p.name} src={p.photoUrl} size="sm" />
                  <span className="font-bold">{p.name}</span>
                  {!supported ? <span className="text-sm text-text-secondary">{t("speciesNotSupported")}</span> : null}
                  {limitReached ? <span className="text-sm text-text-secondary">{t("petLimitReached")}</span> : null}
                  {differentHousehold ? <span className="text-sm text-text-secondary">{t("sameHouseholdRequired")}</span> : null}
                </label>
              );
            })}
          </fieldset>
        )
      ) : null}

      {step === "time" && service ? (
        <div className="flex flex-col gap-4">
          {!isRange && qualifiedStaff.length > 1 ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-bold">{t("professional")}</span>
              <select className="rounded border border-border-subtle bg-surface-base p-2" value={staffId ?? ""} onChange={(e) => setStaffId(e.target.value || null)}>
                <option value="">{t("anyProfessional")}</option>
                {qualifiedStaff.map((m) => <option key={m.providerUserId} value={m.providerUserId}>{m.displayName}{m.displayTitle ? ` — ${m.displayTitle}` : ""}</option>)}
              </select>
            </label>
          ) : null}
          <div className="flex flex-wrap items-end gap-3">
            {isRange ? (
              <DateRangeField
                label={t("checkInOut")}
                min={dayKey(new Date())}
                value={{ start: date || null, end: rangeEnd || null }}
                onChange={(v) => { setDate(v.start ?? ""); setRangeEnd(v.end ?? ""); }}
              />
            ) : (
              <DateField label={t("day")} min={dayKey(new Date())} value={date} onChange={setDate} />
            )}
          </div>
          {!isRange ? (
            slots === null ? (
              <Skeleton className="h-24 w-full" />
            ) : slots.filter((s) => s.state === "AVAILABLE").length === 0 ? (
              <ContextSurface className="flex flex-col gap-3">
                <p>{t("noOpenTimes")}</p>
                {waitlisted ? (
                  <p role="status" className="text-brand-natural">{t("waitlistJoined")}</p>
                ) : (
                  <Button variant="secondary" onClick={() => void joinWaitlist()} disabled={!petIds.length}>{t("joinWaitlist")}</Button>
                )}
              </ContextSurface>
            ) : (
              <fieldset>
                <legend className="mb-2 font-bold">{t("time")}</legend>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {slots
                    .filter((s) => s.state === "AVAILABLE")
                    .filter((s, i, all) => staffId || all.findIndex((x) => x.startAt === s.startAt) === i)
                    .map((s) => (
                      <button key={`${s.startAt}-${s.providerUserId ?? ""}`} type="button" aria-pressed={slot?.startAt === s.startAt} onClick={() => setSlot(s)} className={`rounded border px-2 py-3 text-sm ${slot?.startAt === s.startAt ? "border-brand-natural bg-brand-solid text-on-brand" : "border-border-subtle"}`}>
                        {new Intl.DateTimeFormat(dateLocale, { hour: "2-digit", minute: "2-digit", timeZone: s.timezone }).format(new Date(s.startAt))}
                      </button>
                    ))}
                </div>
              </fieldset>
            )
          ) : null}
        </div>
      ) : null}

      {step === "details" && service ? (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="font-bold">{t(`intake.${CATEGORIES.includes(service.category as typeof CATEGORIES[number]) ? service.category : "OTHER"}` as never)}</span>
            <textarea className="min-h-24 rounded border border-border-subtle bg-surface-base p-3" maxLength={500} value={intake} onChange={(e) => setIntake(e.target.value)} />
          </label>
          {needsAddress ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 font-bold">{service.locationMode === "TRANSPORT" ? t("pickup") : t("serviceAddress")}</legend>
              {addresses === null ? <Skeleton className="h-16 w-full" aria-label={t("loadingAddresses")} /> : addresses.length ? addresses.map((a) => (
                <label key={a.id} className="flex items-center gap-3"><input type="radio" name="address" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />{[a.label, a.addressLine, a.city].filter(Boolean).join("، ")}</label>
              )) : <p className="text-sm text-text-secondary">{t("noSavedAddress")}</p>}
              {service.locationMode === "TRANSPORT" && addresses?.length ? (
                <>
                  <p className="mt-2 font-bold">{t("dropoff")}</p>
                  {addresses.map((a) => <label key={`d-${a.id}`} className="flex items-center gap-3"><input type="radio" name="dropoff" checked={dropoffId === a.id} onChange={() => setDropoffId(a.id)} />{[a.label, a.addressLine, a.city].filter(Boolean).join("، ")}</label>)}
                </>
              ) : null}
            </fieldset>
          ) : null}
          {service.category === "VET" ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 inline-flex items-center gap-2 font-bold"><ShieldCheck size={16} aria-hidden="true" />{t("shareHealthTitle")}</legend>
              <p className="text-sm text-text-secondary">{t("shareHealthDescription")}</p>
              <label className="flex items-start gap-3"><input type="radio" name="health" checked={healthShare === "MINIMAL_VET_CONTEXT"} onChange={() => setHealthShare("MINIMAL_VET_CONTEXT")} /><span>{t("shareBasicIdentity")}</span></label>
              <label className="flex items-start gap-3"><input type="radio" name="health" checked={healthShare === "HEALTH_BASICS"} onChange={() => setHealthShare("HEALTH_BASICS")} /><span>{t("shareHealthBasics")}</span></label>
              {healthShare === null ? <p role="status" className="text-sm text-state-attention">{t("chooseHealthSharing")}</p> : null}
              {petIds[0] ? <Link className="text-sm text-brand-natural" href={`/${locale}/pets/${petIds[0]}/health/share`}>{t("shareSelectedDocuments")}</Link> : null}
            </fieldset>
          ) : null}
        </div>
      ) : null}

      {step === "review" && service ? (
        <ContextSurface className="flex flex-col gap-3">
          <h2 className="text-section-title">{t("reviewTitle")}</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Row label={t("provider")} value={profile.name} />
            <Row label={t("service")} value={`${service.name}${variant ? ` — ${variant.name}` : ""}`} />
            <Row label={t("pet")} value={pets?.filter((p) => petIds.includes(p.id)).map((p) => p.name).join(fa ? "، " : ", ") ?? ""} />
            <Row label={t("professional")} value={qualifiedStaff.find((m) => m.providerUserId === (hold?.providerUserId ?? staffId))?.displayName ?? t("automaticAssignment")} />
            <Row label={t("when")} value={hold ? fmtDateTime(hold.slotStart, hold.timezone) : ""} />
            <Row label={t("durationLabel")} value={formatDuration(variant?.durationMinutes ?? service.durationMinutes)} />
            <Row label={t("location")} value={needsAddress ? (addresses?.find((a) => a.id === addressId)?.addressLine ?? "") : [profile.locations.find((l) => l.id === locationId)?.addressLine, profile.locations.find((l) => l.id === locationId)?.city].filter(Boolean).join(fa ? "، " : ", ")} />
            <Row label={t("price")} value={total !== null ? formatPrice(total) : t("priceOnRequest")} />
            <Row label={t("payment")} value={`${paymentLabel(service.paymentMode)}${service.paymentMode === "DEPOSIT" && service.depositAmount ? ` — ${formatPrice(service.depositAmount)}` : ""}`} />
            <Row label={t("bookingType")} value={service.bookingMode === "REQUEST" ? t("requestBooking") : t("instantBooking")} />
            <Row label={t("cancellationLabel")} value={service.cancellationPolicy ?? t("cancellationFallback", { hours: service.freeCancellationHours.toLocaleString(locale), percent: service.lateCancellationRefundPercent.toLocaleString(locale) })} />
            {service.preparationNotes ? <Row label={t("preparation")} value={service.preparationNotes} /> : null}
            {service.category === "VET" ? <Row label={t("healthDataShared")} value={healthShare === "HEALTH_BASICS" ? t("sharedHealthBasics") : t("sharedBasicIdentity")} /> : null}
          </dl>
          <p className="text-xs text-text-secondary">{t("termsSnapshotNotice")}</p>
        </ContextSurface>
      ) : null}

      <footer className="sticky bottom-0 flex justify-between gap-3 border-t border-border-subtle bg-surface-base py-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <Button variant="ghost" disabled={stepIndex === 0 || busy || (Boolean(hold) && step === "details")} onClick={() => setStep(STEPS[stepIndex - 1]!)}>{t("previous")}</Button>
        {step === "time" ? (
          <Button disabled={!canContinue.time || busy} onClick={() => void createHold()}>{busy ? t("holding") : t("holdTime")}</Button>
        ) : step === "review" ? (
          <Button disabled={!canContinue.review || busy} onClick={() => void confirm()}>{busy ? t("submitting") : service?.bookingMode === "REQUEST" ? t("sendRequest") : service?.paymentMode === "FULL_PREPAYMENT" || service?.paymentMode === "DEPOSIT" ? t("bookAndPay") : t("confirmBooking")}</Button>
        ) : (
          <Button disabled={!canContinue[step] || busy} onClick={() => (step === "pets" && !requireSession() ? undefined : setStep(STEPS[stepIndex + 1]!))}>{t("continue")}</Button>
        )}
      </footer>
    </div>
    <aside className="flow-summary" aria-label={t("summaryLabel")}>
      <h2>{t("summaryLabel")}</h2>
      <dl>
        <div><dt>{t("provider")}</dt><dd>{profile.name}</dd></div>
        <div><dt>{t("service")}</dt><dd className={service ? "" : "is-empty"}>{service ? `${service.name}${variant ? ` — ${variant.name}` : ""}` : t("notChosen")}</dd></div>
        <div><dt>{t("pet")}</dt><dd className={petIds.length ? "" : "is-empty"}>{petIds.length ? (pets?.filter((p) => petIds.includes(p.id)).map((p) => p.name).join(fa ? "، " : ", ") ?? "") : t("notChosen")}</dd></div>
        <div><dt>{t("when")}</dt><dd className={hold || slot || (isRange && rangeEnd) ? "" : "is-empty"}>{hold ? fmtDateTime(hold.slotStart, hold.timezone) : slot ? fmtDateTime(slot.startAt, slot.timezone) : isRange && rangeEnd ? `${fmtDay(date)} — ${fmtDay(rangeEnd)}` : t("notChosen")}</dd></div>
        {service ? <div><dt>{t("durationLabel")}</dt><dd>{formatDuration(variant?.durationMinutes ?? service.durationMinutes)}</dd></div> : null}
      </dl>
      <div className="flow-summary__total"><span>{t("price")}</span><strong>{total ? formatPrice(total) : t("priceOnRequest")}</strong></div>
      {service ? <p className="flow-summary__note">{service.cancellationPolicy ?? t("summaryCancellationFallback", { hours: service.freeCancellationHours.toLocaleString(locale) })}</p> : null}
    </aside>
    </div>
    </BookingFrame>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-text-secondary">{label}</dt>
      <dd className="mt-1 text-text-primary">{value}</dd>
    </div>
  );
}

/** Kept for the booking-detail consumer; the creation flow itself uses its four-locale catalog. */
export function errorMessage(e: unknown, fa: boolean): string {
  const code = e instanceof ApiError ? e.code : "";
  const map: Record<string, [string, string]> = {
    SLOT_UNAVAILABLE: ["این زمان همین حالا گرفته شد. زمان دیگری انتخاب کنید.", "That time was just taken. Please choose another."],
    BOOKING_CONFLICT: ["این زمان همین حالا گرفته شد. زمان دیگری انتخاب کنید.", "That time was just taken. Please choose another."],
    HOLD_EXPIRED: ["زمان نگه‌داری تمام شد. دوباره زمان را انتخاب کنید.", "Your hold expired. Please choose a time again."],
    PET_NOT_SUPPORTED: ["این خدمت برای حیوان انتخاب‌شده ارائه نمی‌شود.", "This service is not offered for the selected pet."],
    PET_CONTEXT_INCOMPLETE: ["این ارائه‌دهنده قبل از رزرو، تکمیل پروفایل مراقبت یا سلامت حیوان را لازم دانسته است.", "This provider requires the pet's care or health profile before booking."],
    ADDRESS_REQUIRED: ["آدرس محل خدمت را انتخاب کنید.", "Please choose the service address."],
    PET_ACCESS_DENIED: ["اجازه رزرو برای این حیوان را ندارید.", "You are not allowed to book for this pet."],
    INVALID_BOOKING_TRANSITION: ["وضعیت این نوبت تغییر کرده است. صفحه را تازه کنید.", "This booking changed state. Please refresh."],
  };
  if (map[code]) return map[code]![fa ? 0 : 1];
  if (e instanceof ApiError && e.status === 429) return fa ? "درخواست‌ها زیاد بود؛ کمی بعد دوباره تلاش کنید." : "Too many requests; please try again shortly.";
  return fa ? "انجام نشد. اتصال را بررسی کنید و دوباره تلاش کنید." : "That did not work. Check your connection and try again.";
}
