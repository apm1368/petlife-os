"use client";

import Link from "next/link";
import { randomId } from "@/lib/id/random-id";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, ContextSurface, EmptyState, ErrorRecovery, ShieldCheck, Skeleton, Timer } from "@petlife/ui";
import type { AvailabilitySlotDto, BookingHoldDto, CustomerAddressDto, PetDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import { discoveryService, type ProviderProfile } from "@/services/discovery.service";
import { servicesService } from "@/services/services.service";
import { bookingsService } from "@/services/bookings.service";
import { householdsService } from "@/services/households.service";
import { addressesService } from "@/services/addresses.service";
import { useSessionStore } from "@/stores/session-store";
import { categoryLabel, paymentModeLabel } from "@/features/discovery/labels";
import { DateField } from "@/features/shared/date-picker/DateField";
import { DateRangeField } from "@/features/shared/date-picker/DateRangePicker";
import { BackLink } from "@/features/shared/BackLink";
import { Stepper } from "@/features/shared/Stepper";
import { formatDay } from "@/lib/date/jalali";

type Step = "service" | "pets" | "time" | "details" | "review";
const STEPS: Step[] = ["service", "pets", "time", "details", "review"];
const STEP_LABEL: Record<Step, [string, string]> = { service: ["خدمت", "Service"], pets: ["حیوان", "Pet"], time: ["زمان", "Time"], details: ["جزئیات", "Details"], review: ["بازبینی", "Review"] };
const RANGE_CATEGORIES = ["SITTING", "BOARDING"];
const INTAKE_LABEL: Record<string, [string, string]> = {
  VET: ["علت مراجعه", "Reason for visit"],
  GROOMING: ["توضیحات آرایش (حساسیت‌ها، مدل اصلاح)", "Grooming notes (sensitivities, style)"],
  WALKING: ["دستورالعمل مراقبت", "Care instructions"],
  SITTING: ["دستورالعمل مراقبت", "Care instructions"],
  BOARDING: ["دستورالعمل مراقبت", "Care instructions"],
  TRAINING: ["هدف آموزشی", "Training goal"],
  PET_TAXI: ["اطلاعات سوار و پیاده شدن", "Pickup and drop-off details"],
  OTHER: ["توضیحات", "Notes"],
};

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
  const locale = useLocale() as "fa" | "en";
  const fa = locale === "fa";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const session = useSessionStore((s) => s.status);

  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "notFound" | "error">("loading");
  const [step, setStep] = useState<Step>(params.get("serviceId") ? "pets" : "service");
  const [serviceId, setServiceId] = useState<string | null>(params.get("serviceId"));
  const [variantId, setVariantId] = useState<string | null>(params.get("variantId"));
  const [pets, setPets] = useState<PetDto[] | null>(null);
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
  const qualifiedStaff = useMemo(() => (profile && service ? profile.team.filter((m) => !service.staffIds.length || service.staffIds.includes(m.providerUserId)) : []), [profile, service]);

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
        const lists = await Promise.all(households.map((h) => householdsService.listPets(h.id)));
        const all = lists.flat();
        setPets(all);
        if (all.length === 1) setPetIds([all[0]!.id]);
        if (households[0]) setAddresses(await addressesService.list(households[0].id));
      } catch {
        setError(fa ? "فهرست حیوانات بارگیری نشد." : "Your pets could not be loaded.");
      }
    })();
  }, [step, session, pets, fa]);

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

  if (loadState === "loading") return <Skeleton className="h-96 w-full" />;
  if (loadState === "notFound") return <EmptyState title={fa ? "این ارائه‌دهنده قابل رزرو نیست" : "This provider cannot be booked"} />;
  if (loadState === "error" || !profile) return <ErrorRecovery title={fa ? "اطلاعات رزرو بارگیری نشد" : "Booking could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={load} />;

  const unitPrice = variant?.priceAmount ?? service?.priceAmount ?? null;
  const total = unitPrice === null ? null : unitPrice * Math.max(1, petIds.length);
  const fmtDateTime = (iso: string, tz?: string) => new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: tz ?? "Asia/Tehran" }).format(new Date(iso));

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
      setError(errorMessage(e, fa));
      if (e instanceof ApiError && e.code === "SLOT_UNAVAILABLE") setSlots((prev) => prev?.map((s) => (s.startAt === slot?.startAt ? { ...s, state: "BOOKED" } : s)) ?? null);
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
      setError(errorMessage(e, fa));
      setBusy(false);
    }
  }

  async function joinWaitlist() {
    if (!service || !requireSession() || !petIds[0]) return;
    try {
      await bookingsService.joinWaitlist({ petId: petIds[0], providerId, serviceId: service.id, variantId: variantId ?? undefined, windowStart: new Date(`${date}T00:00:00Z`).toISOString(), windowEnd: new Date(`${date}T23:59:59Z`).toISOString() });
      setWaitlisted(true);
    } catch (e) {
      setError(errorMessage(e, fa));
    }
  }

  const stepIndex = STEPS.indexOf(step);
  const canContinue: Record<Step, boolean> = {
    service: Boolean(service && (!service.variants.length || variant)),
    pets: petIds.length > 0 && petIds.length <= (service?.maxPetsPerBooking ?? 1),
    time: isRange ? Boolean(rangeEnd && rangeEnd > date) : Boolean(slot),
    details: (!needsAddress || Boolean(addressId)) && (service?.locationMode !== "TRANSPORT" || Boolean(dropoffId)) && (service?.category !== "VET" || healthShare !== null) && !holdExpired,
    review: Boolean(hold) && !holdExpired,
  };

  return (
    <div className="flow-layout">
    <div className="flow-main">
      <header className="flex flex-col gap-3">
        <BackLink href={`/${locale}/providers/${providerId}`} label={profile.name} />
        <h1 className="text-page-title">{fa ? "رزرو نوبت" : "Book an appointment"}</h1>
        <Stepper steps={STEPS.map((s) => STEP_LABEL[s][fa ? 0 : 1])} current={stepIndex} label={fa ? "مراحل رزرو" : "Booking steps"} />
      </header>

      {hold && step !== "review" && step !== "details" ? null : hold ? (
        <p role="status" className={`inline-flex items-center gap-2 text-sm ${holdExpired ? "text-state-urgent" : "text-text-secondary"}`}>
          <Timer size={16} aria-hidden="true" />
          {holdExpired
            ? fa ? "زمان نگه‌داری نوبت تمام شد. لطفاً دوباره زمان را انتخاب کنید." : "Your hold expired. Please choose the time again."
            : fa ? `این زمان تا ${Math.floor(holdSecondsLeft / 60).toLocaleString(locale)}:${(holdSecondsLeft % 60).toLocaleString(locale, { minimumIntegerDigits: 2 })} برای شما نگه داشته شده است.` : `This time is held for you for ${Math.floor(holdSecondsLeft / 60)}:${String(holdSecondsLeft % 60).padStart(2, "0")}.`}
          {holdExpired ? <button type="button" className="font-bold text-brand-natural" onClick={() => { setHold(null); setStep("time"); }}>{fa ? "انتخاب دوباره" : "Choose again"}</button> : null}
        </p>
      ) : null}

      {error ? <p role="alert" className="text-state-urgent">{error}</p> : null}

      {step === "service" ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 font-bold">{fa ? "کدام خدمت؟" : "Which service?"}</legend>
          {profile.services.map((s) => (
            <label key={s.id} className={`flex cursor-pointer flex-col gap-1 rounded-md border p-4 ${s.id === serviceId ? "border-brand-natural" : "border-border-subtle"}`}>
              <span className="flex items-center gap-3"><input type="radio" name="service" checked={s.id === serviceId} onChange={() => { setServiceId(s.id); setVariantId(null); }} /><span className="font-bold">{s.name}</span></span>
              <span className="text-sm text-text-secondary">{categoryLabel(s.category, fa)} · {s.durationMinutes.toLocaleString(locale)} {fa ? "دقیقه" : "min"} · {s.startingPrice ? formatCurrency(s.startingPrice, locale) : fa ? "قیمت پس از استعلام" : "Price on request"}</span>
            </label>
          ))}
          {service?.variants.length ? (
            <fieldset className="flex flex-col gap-2 border-s-2 border-brand-natural ps-4">
              <legend className="mb-2 font-bold">{fa ? "گزینه" : "Option"}</legend>
              {service.variants.map((v) => (
                <label key={v.id} className="flex items-center gap-3">
                  <input type="radio" name="variant" checked={v.id === variantId} onChange={() => setVariantId(v.id)} />
                  <span>{v.name} · {v.durationMinutes.toLocaleString(locale)} {fa ? "دقیقه" : "min"}{v.priceAmount !== null ? ` · ${formatCurrency(v.priceAmount, locale)}` : ""}</span>
                </label>
              ))}
            </fieldset>
          ) : null}
        </fieldset>
      ) : null}

      {step === "pets" ? (
        session !== "authenticated" ? (
          <ContextSurface className="flex flex-col gap-3">
            <p>{fa ? "برای انتخاب حیوان و رزرو، وارد حساب پت‌لایف شوید. انتخاب شما حفظ می‌شود." : "Sign in to choose your pet and book. Your selection is kept."}</p>
            <Button onClick={() => requireSession()}>{fa ? "ورود و ادامه" : "Sign in and continue"}</Button>
          </ContextSurface>
        ) : !pets ? (
          <Skeleton className="h-32 w-full" />
        ) : pets.length === 0 ? (
          <EmptyState title={fa ? "هنوز حیوانی ثبت نکرده‌اید" : "You have not added a pet yet"} actionLabel={fa ? "افزودن حیوان" : "Add a pet"} onAction={() => router.push(`/${locale}/pets/new`)} />
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-bold">{service && service.maxPetsPerBooking > 1 ? (fa ? `تا ${service.maxPetsPerBooking.toLocaleString(locale)} حیوان انتخاب کنید` : `Choose up to ${service.maxPetsPerBooking} pets`) : fa ? "برای کدام حیوان؟" : "For which pet?"}</legend>
            {pets.map((p) => {
              const supported = !service || (p.species === "DOG" ? service.supportsDog : p.species === "CAT" ? service.supportsCat : false);
              const multi = (service?.maxPetsPerBooking ?? 1) > 1;
              return (
                <label key={p.id} className={`flex items-center gap-3 rounded-md border p-3 ${petIds.includes(p.id) ? "border-brand-natural" : "border-border-subtle"} ${supported ? "" : "opacity-60"}`}>
                  <input type={multi ? "checkbox" : "radio"} name="pet" disabled={!supported} checked={petIds.includes(p.id)} onChange={(e) => setPetIds((prev) => (multi ? (e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)) : [p.id]))} />
                  <span className="font-bold">{p.name}</span>
                  {!supported ? <span className="text-sm text-text-secondary">{fa ? "این خدمت برای این گونه ارائه نمی‌شود" : "Not offered for this species"}</span> : null}
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
              <span className="font-bold">{fa ? "متخصص" : "Professional"}</span>
              <select className="rounded border border-border-subtle bg-surface-base p-2" value={staffId ?? ""} onChange={(e) => setStaffId(e.target.value || null)}>
                <option value="">{fa ? "هر متخصص در دسترس" : "Any available professional"}</option>
                {qualifiedStaff.map((m) => <option key={m.providerUserId} value={m.providerUserId}>{m.displayName}{m.displayTitle ? ` — ${m.displayTitle}` : ""}</option>)}
              </select>
            </label>
          ) : null}
          <div className="flex flex-wrap items-end gap-3">
            {isRange ? (
              <DateRangeField
                label={fa ? "تاریخ ورود و خروج" : "Check-in and check-out"}
                min={dayKey(new Date())}
                value={{ start: date || null, end: rangeEnd || null }}
                onChange={(v) => { setDate(v.start ?? ""); setRangeEnd(v.end ?? ""); }}
              />
            ) : (
              <DateField label={fa ? "روز" : "Day"} min={dayKey(new Date())} value={date} onChange={setDate} />
            )}
          </div>
          {!isRange ? (
            slots === null ? (
              <Skeleton className="h-24 w-full" />
            ) : slots.filter((s) => s.state === "AVAILABLE").length === 0 ? (
              <ContextSurface className="flex flex-col gap-3">
                <p>{fa ? "در این روز زمان آزادی نیست." : "No open times on this day."}</p>
                {waitlisted ? (
                  <p role="status" className="text-brand-natural">{fa ? "به لیست انتظار اضافه شدید. اگر زمانی آزاد شود خبرتان می‌کنیم؛ رزرو خودکار انجام نمی‌شود." : "You joined the waitlist. We will notify you if a time opens; nothing is booked automatically."}</p>
                ) : (
                  <Button variant="secondary" onClick={() => void joinWaitlist()} disabled={!petIds.length}>{fa ? "عضویت در لیست انتظار این روز" : "Join the waitlist for this day"}</Button>
                )}
              </ContextSurface>
            ) : (
              <fieldset>
                <legend className="mb-2 font-bold">{fa ? "زمان" : "Time"}</legend>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {slots
                    .filter((s) => s.state === "AVAILABLE")
                    .filter((s, i, all) => staffId || all.findIndex((x) => x.startAt === s.startAt) === i)
                    .map((s) => (
                      <button key={`${s.startAt}-${s.providerUserId ?? ""}`} type="button" aria-pressed={slot?.startAt === s.startAt} onClick={() => setSlot(s)} className={`rounded border px-2 py-3 text-sm ${slot?.startAt === s.startAt ? "border-brand-natural bg-brand-solid text-on-brand" : "border-border-subtle"}`}>
                        {new Intl.DateTimeFormat(fa ? "fa-IR" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: s.timezone }).format(new Date(s.startAt))}
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
            <span className="font-bold">{INTAKE_LABEL[service.category]?.[fa ? 0 : 1] ?? (fa ? "توضیحات" : "Notes")}</span>
            <textarea className="min-h-24 rounded border border-border-subtle bg-surface-base p-3" maxLength={500} value={intake} onChange={(e) => setIntake(e.target.value)} />
          </label>
          {needsAddress ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 font-bold">{service.locationMode === "TRANSPORT" ? (fa ? "مبدأ" : "Pickup") : fa ? "آدرس محل خدمت" : "Service address"}</legend>
              {addresses?.length ? addresses.map((a) => (
                <label key={a.id} className="flex items-center gap-3"><input type="radio" name="address" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />{[a.label, a.addressLine, a.city].filter(Boolean).join("، ")}</label>
              )) : <p className="text-sm text-text-secondary">{fa ? "آدرسی ثبت نشده است؛ از بخش حساب کاربری آدرس اضافه کنید." : "No saved address; add one in your account."}</p>}
              {service.locationMode === "TRANSPORT" && addresses?.length ? (
                <>
                  <p className="mt-2 font-bold">{fa ? "مقصد" : "Drop-off"}</p>
                  {addresses.map((a) => <label key={`d-${a.id}`} className="flex items-center gap-3"><input type="radio" name="dropoff" checked={dropoffId === a.id} onChange={() => setDropoffId(a.id)} />{[a.label, a.addressLine, a.city].filter(Boolean).join("، ")}</label>)}
                </>
              ) : null}
            </fieldset>
          ) : null}
          {service.category === "VET" ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 inline-flex items-center gap-2 font-bold"><ShieldCheck size={16} aria-hidden="true" />{fa ? "اشتراک اطلاعات سلامت با دامپزشک" : "Share health information with the vet"}</legend>
              <p className="text-sm text-text-secondary">{fa ? "رزرو به‌تنهایی به دامپزشک اجازه دیدن پرونده نمی‌دهد. خودتان انتخاب کنید." : "A booking alone never lets the vet see the medical record. You choose."}</p>
              <label className="flex items-start gap-3"><input type="radio" name="health" checked={healthShare === "MINIMAL_VET_CONTEXT"} onChange={() => setHealthShare("MINIMAL_VET_CONTEXT")} /><span>{fa ? "فقط مشخصات پایه حیوان (نام، گونه، سن)" : "Basic identity only (name, species, age)"}</span></label>
              <label className="flex items-start gap-3"><input type="radio" name="health" checked={healthShare === "HEALTH_BASICS"} onChange={() => setHealthShare("HEALTH_BASICS")} /><span>{fa ? "خلاصه سلامت (بیماری‌ها، آلرژی‌ها، داروهای فعال، وضعیت واکسن) تا ۲۴ ساعت پس از نوبت" : "Health summary (conditions, allergies, active medications, vaccination status) until 24h after the visit"}</span></label>
              {petIds[0] ? <Link className="text-sm text-brand-natural" href={`/${locale}/pets/${petIds[0]}/health/share`}>{fa ? "اشتراک دقیق‌تر اسناد انتخابی از بخش «اشتراک با دامپزشک»" : "Share selected documents precisely via Share with Vet"}</Link> : null}
            </fieldset>
          ) : null}
        </div>
      ) : null}

      {step === "review" && service ? (
        <ContextSurface className="flex flex-col gap-3">
          <h2 className="text-section-title">{fa ? "همه چیز را یک‌بار بازبینی کنید" : "Review everything once"}</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Row label={fa ? "ارائه‌دهنده" : "Provider"} value={profile.name} />
            <Row label={fa ? "خدمت" : "Service"} value={`${service.name}${variant ? ` — ${variant.name}` : ""}`} />
            <Row label={fa ? "حیوان" : "Pet"} value={pets?.filter((p) => petIds.includes(p.id)).map((p) => p.name).join("، ") ?? ""} />
            <Row label={fa ? "متخصص" : "Professional"} value={qualifiedStaff.find((m) => m.providerUserId === (hold?.providerUserId ?? staffId))?.displayName ?? (fa ? "تخصیص خودکار" : "Assigned automatically")} />
            <Row label={fa ? "زمان" : "When"} value={hold ? fmtDateTime(hold.slotStart, hold.timezone) : ""} />
            <Row label={fa ? "مدت" : "Duration"} value={`${(variant?.durationMinutes ?? service.durationMinutes).toLocaleString(locale)} ${fa ? "دقیقه" : "min"}`} />
            <Row label={fa ? "مکان" : "Location"} value={needsAddress ? (addresses?.find((a) => a.id === addressId)?.addressLine ?? "") : [profile.locations.find((l) => l.id === locationId)?.addressLine, profile.locations.find((l) => l.id === locationId)?.city].filter(Boolean).join("، ")} />
            <Row label={fa ? "مبلغ" : "Price"} value={total !== null ? formatCurrency(total, locale) : fa ? "پس از استعلام" : "On request"} />
            <Row label={fa ? "پرداخت" : "Payment"} value={`${paymentModeLabel(service.paymentMode, fa)}${service.paymentMode === "DEPOSIT" && service.depositAmount ? ` — ${formatCurrency(service.depositAmount, locale)}` : ""}`} />
            <Row label={fa ? "نوع رزرو" : "Booking type"} value={service.bookingMode === "REQUEST" ? (fa ? "درخواست؛ پس از تأیید ارائه‌دهنده قطعی می‌شود" : "Request; confirmed after the provider accepts") : fa ? "فوری" : "Instant"} />
            <Row label={fa ? "قوانین لغو" : "Cancellation"} value={service.cancellationPolicy ?? (fa ? `لغو رایگان تا ${service.freeCancellationHours.toLocaleString(locale)} ساعت قبل؛ سپس ${service.lateCancellationRefundPercent.toLocaleString(locale)}٪ بازگشت وجه` : `Free until ${service.freeCancellationHours}h before; then ${service.lateCancellationRefundPercent}% refund`)} />
            {service.preparationNotes ? <Row label={fa ? "آمادگی" : "Preparation"} value={service.preparationNotes} /> : null}
            {service.category === "VET" ? <Row label={fa ? "اطلاعات سلامت مشترک" : "Health data shared"} value={healthShare === "HEALTH_BASICS" ? (fa ? "خلاصه سلامت تا ۲۴ ساعت پس از نوبت" : "Health summary until 24h after the visit") : fa ? "فقط مشخصات پایه" : "Basic identity only"} /> : null}
          </dl>
          <p className="text-xs text-text-secondary">{fa ? "مبلغ و قوانین همین حالا ثبت می‌شوند و تغییرات بعدی ارائه‌دهنده روی این نوبت اثری ندارد." : "Price and terms are recorded now; later provider changes do not affect this booking."}</p>
        </ContextSurface>
      ) : null}

      <footer className="sticky bottom-0 flex justify-between gap-3 border-t border-border-subtle bg-surface-base py-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <Button variant="ghost" disabled={stepIndex === 0 || busy || (Boolean(hold) && step === "details")} onClick={() => setStep(STEPS[stepIndex - 1]!)}>{fa ? "قبلی" : "Back"}</Button>
        {step === "time" ? (
          <Button disabled={!canContinue.time || busy} onClick={() => void createHold()}>{busy ? (fa ? "در حال نگه‌داشتن…" : "Holding…") : fa ? "نگه‌داشتن این زمان" : "Hold this time"}</Button>
        ) : step === "review" ? (
          <Button disabled={!canContinue.review || busy} onClick={() => void confirm()}>{busy ? (fa ? "در حال ثبت…" : "Submitting…") : service?.bookingMode === "REQUEST" ? (fa ? "ارسال درخواست" : "Send request") : service?.paymentMode === "FULL_PREPAYMENT" || service?.paymentMode === "DEPOSIT" ? (fa ? "ثبت و رفتن به پرداخت" : "Book and go to payment") : fa ? "تأیید نوبت" : "Confirm booking"}</Button>
        ) : (
          <Button disabled={!canContinue[step] || busy} onClick={() => (step === "pets" && !requireSession() ? undefined : setStep(STEPS[stepIndex + 1]!))}>{fa ? "ادامه" : "Continue"}</Button>
        )}
      </footer>
    </div>
    <aside className="flow-summary" aria-label={fa ? "خلاصهٔ رزرو" : "Booking summary"}>
      <h2>{fa ? "خلاصهٔ رزرو" : "Your booking"}</h2>
      <dl>
        <div><dt>{fa ? "ارائه‌دهنده" : "Provider"}</dt><dd>{profile.name}</dd></div>
        <div><dt>{fa ? "خدمت" : "Service"}</dt><dd className={service ? "" : "is-empty"}>{service ? `${service.name}${variant ? ` — ${variant.name}` : ""}` : fa ? "انتخاب نشده" : "Not chosen"}</dd></div>
        <div><dt>{fa ? "حیوان" : "Pet"}</dt><dd className={petIds.length ? "" : "is-empty"}>{petIds.length ? (pets?.filter((p) => petIds.includes(p.id)).map((p) => p.name).join(fa ? "، " : ", ") ?? "") : fa ? "انتخاب نشده" : "Not chosen"}</dd></div>
        <div><dt>{fa ? "زمان" : "When"}</dt><dd className={hold || slot || (isRange && rangeEnd) ? "" : "is-empty"}>{hold ? fmtDateTime(hold.slotStart, hold.timezone) : slot ? fmtDateTime(slot.startAt, slot.timezone) : isRange && rangeEnd ? `${formatDay(date, fa ? "fa" : "en")} — ${formatDay(rangeEnd, fa ? "fa" : "en")}` : fa ? "انتخاب نشده" : "Not chosen"}</dd></div>
        {service ? <div><dt>{fa ? "مدت" : "Duration"}</dt><dd>{`${(variant?.durationMinutes ?? service.durationMinutes).toLocaleString(locale)} ${fa ? "دقیقه" : "min"}`}</dd></div> : null}
      </dl>
      <div className="flow-summary__total"><span>{fa ? "مبلغ" : "Price"}</span><strong>{total ? formatCurrency(total, locale) : fa ? "پس از استعلام" : "On request"}</strong></div>
      {service ? <p className="flow-summary__note">{service.cancellationPolicy ?? (fa ? `لغو رایگان تا ${service.freeCancellationHours.toLocaleString(locale)} ساعت قبل از نوبت.` : `Free cancellation up to ${service.freeCancellationHours} hours before.`)}</p> : null}
    </aside>
    </div>
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
