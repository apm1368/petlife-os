"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import { LocationMode, ServiceCategory, type AvailabilitySlotDto, type CustomerAddressDto, type PetDto } from "@petlife/types";
import { formatAppointmentDateTime, formatDateKey, formatDateTimeRange, formatDayLabel, formatTimeLabel } from "@/lib/date/appointment-date";
import { servicesService } from "@/services/services.service";
import { bookingsService } from "@/services/bookings.service";
import { addressesService } from "@/services/addresses.service";
import { petsService } from "@/services/pets.service";
import { ApiError } from "@/lib/api/client";
import { useBookingStore } from "@/stores/booking-store";
import { DEFAULT_ACCESS_PRESET_BY_CATEGORY } from "./access-presets";

type Step = "slot" | "address" | "review" | "care-sharing" | "submitting";

const DATE_RANGE_CATEGORIES: ServiceCategory[] = [ServiceCategory.SITTING, ServiceCategory.BOARDING];

function needsAddress(locationMode: LocationMode | null): boolean {
  return locationMode !== null && locationMode !== LocationMode.AT_PROVIDER;
}

export function ServiceBookingWizard({ serviceId }: { serviceId: string }) {
  const t = useTranslations("services.booking");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";
  const draft = useBookingStore((s) => s);
  const updateBooking = useBookingStore((s) => s.update);
  const resetBooking = useBookingStore((s) => s.reset);

  const [step, setStep] = useState<Step>("slot");
  const [pet, setPet] = useState<PetDto | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isDateRange = draft.category ? DATE_RANGE_CATEGORIES.includes(draft.category) : false;

  useEffect(() => {
    if (draft.petId) void petsService.getById(draft.petId).then(setPet);
  }, [draft.petId]);

  if (!draft.petId || !draft.locationId || !draft.serviceId || draft.serviceId !== serviceId) {
    return <EmptyState title={t("noDraft")} actionLabel={t("backToResults")} onAction={() => router.push(`/${locale}/services`)} />;
  }

  async function onHoldCreated() {
    setStep(needsAddress(draft.locationMode) ? "address" : "review");
  }

  async function confirmBooking() {
    setStep("submitting");
    setSubmitError(null);
    try {
      const booking = await bookingsService.confirm(
        {
          holdId: draft.holdId!,
          petId: draft.petId!,
          reasonForVisit: draft.reasonForVisit.trim() || undefined,
          accessSelection: draft.accessSelection ?? undefined,
          customerAddressId: draft.customerAddressId ?? undefined,
          dropoffAddressId: draft.dropoffAddressId ?? undefined,
        },
        draft.confirmIdempotencyKey,
      );
      resetBooking();
      router.push(`/${locale}/bookings/${booking.id}?confirmed=1`);
    } catch (err) {
      setSubmitError(mapError(err, t));
      setStep(needsAddress(draft.locationMode) ? "address" : "review");
    }
  }

  if (step === "slot") {
    return isDateRange ? (
      <DateRangeStep serviceId={serviceId} error={submitError} setSubmitError={setSubmitError} onHold={onHoldCreated} />
    ) : (
      <SlotPickerStep serviceId={serviceId} error={submitError} setSubmitError={setSubmitError} onHold={onHoldCreated} />
    );
  }

  if (step === "address") {
    return (
      <AddressStep
        onBack={() => setStep("slot")}
        onNext={() => setStep("review")}
      />
    );
  }

  if (step === "review") {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-page-title text-text-primary">{t("review.title")}</h1>
        <ContextSurface className="flex flex-col gap-3">
          <Row label={t("review.pet")} value={pet?.name ?? "…"} />
          <Row label={t("review.provider")} value={draft.providerName} />
          <Row label={t("review.service")} value={draft.serviceName} />
          <Row label={t("review.location")} value={draft.locationLabel || t("review.atCustomerLocation")} />
          <Row
            label={t("review.dateTime")}
            value={
              draft.slotStart && draft.slotEnd && draft.timezone
                ? isDateRange
                  ? formatDateTimeRange(draft.slotStart, draft.slotEnd, locale, draft.timezone)
                  : formatAppointmentDateTime(draft.slotStart, locale, draft.timezone)
                : "…"
            }
          />
          {draft.priceAmount ? (
            <Row label={t("review.price")} value={`${draft.priceAmount.toLocaleString(locale)} ${draft.currency ?? ""}`} />
          ) : null}
          <Row label={t("review.paymentStatus")} value={t("review.paymentPlaceholder")} />
        </ContextSurface>
        <ContextSurface className="flex flex-col gap-2">
          <label htmlFor="reasonForVisit" className="text-metadata text-text-secondary">
            {t("review.notesLabel")}
          </label>
          <textarea
            id="reasonForVisit"
            value={draft.reasonForVisit}
            onChange={(e) => updateBooking({ reasonForVisit: e.target.value })}
            rows={2}
            className="rounded-md border border-border-strong bg-surface-elevated p-3 text-body text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          />
        </ContextSurface>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setStep(needsAddress(draft.locationMode) ? "address" : "slot")}>
            {tCommon("back")}
          </Button>
          <Button variant="primary" className="flex-1" onClick={() => setStep("care-sharing")}>
            {tCommon("continue")}
          </Button>
        </div>
      </div>
    );
  }

  // care-sharing and submitting
  const preset = draft.category ? DEFAULT_ACCESS_PRESET_BY_CATEGORY[draft.category] : null;
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("careSharing.title")}</h1>
      <ContextSurface className="flex flex-col gap-2">
        <Row label={t("careSharing.who")} value={draft.providerName} />
        <Row label={t("careSharing.why")} value={t("careSharing.whyValue", { service: draft.serviceName })} />
        <Row
          label={t("careSharing.until")}
          value={draft.slotEnd && draft.timezone ? formatAppointmentDateTime(draft.slotEnd, locale, draft.timezone) : "…"}
        />
      </ContextSurface>

      {preset ? (
        <ContextSurface className="flex flex-col gap-2">
          <p className="text-metadata text-text-secondary">{t("careSharing.what")}</p>
          <p className="text-body text-text-primary">{t(`careSharing.preset.${preset}.title`)}</p>
          <p className="text-metadata text-text-secondary">{t(`careSharing.preset.${preset}.description`)}</p>
        </ContextSurface>
      ) : null}

      {submitError ? (
        <p role="alert" className="text-metadata text-state-urgent">
          {submitError}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button variant="ghost" onClick={() => setStep("review")} disabled={step === "submitting"}>
          {tCommon("back")}
        </Button>
        <Button variant="primary" className="flex-1" isLoading={step === "submitting"} onClick={confirmBooking}>
          {t("careSharing.confirm")}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-metadata text-text-secondary">{label}</span>
      <span className="text-body text-text-primary">{value}</span>
    </div>
  );
}

function AddressStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const t = useTranslations("services.booking.address");
  const tCommon = useTranslations("common");
  const draft = useBookingStore((s) => s);
  const updateBooking = useBookingStore((s) => s.update);
  const [addresses, setAddresses] = useState<CustomerAddressDto[] | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ addressLine: "", city: "", countryCode: "" });
  const isTaxi = draft.locationMode === LocationMode.TRANSPORT;

  useEffect(() => {
    void petsService.getById(draft.petId!).then(async (pet) => {
      setHouseholdId(pet.householdId);
      setAddresses(await addressesService.list(pet.householdId));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createAddress() {
    if (!householdId) return;
    setCreating(true);
    try {
      const address = await addressesService.create({ householdId, ...form });
      setAddresses((prev) => [address, ...(prev ?? [])]);
      updateBooking({ customerAddressId: address.id, dropoffAddressId: isTaxi ? address.id : draft.dropoffAddressId });
    } finally {
      setCreating(false);
    }
  }

  if (!addresses) return <Skeleton className="h-48 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>

      {addresses.length > 0 ? (
        <div className="flex flex-col gap-2">
          {addresses.map((address) => (
            <button key={address.id} type="button" className="w-full text-start" onClick={() => updateBooking({ customerAddressId: address.id })}>
              <ContextSurface className={draft.customerAddressId === address.id ? "border-brand-mint" : ""}>
                <p className="text-body text-text-primary">{address.addressLine}</p>
                <p className="text-metadata text-text-secondary">{address.city}</p>
              </ContextSurface>
            </button>
          ))}
        </div>
      ) : null}

      <ContextSurface className="flex flex-col gap-2">
        <p className="text-metadata text-text-secondary">{t("addNew")}</p>
        <input
          aria-label={t("addressLine")}
          placeholder={t("addressLine")}
          value={form.addressLine}
          onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
          className="rounded-md border border-border-strong bg-surface-elevated p-2 text-body text-text-primary"
        />
        <input
          aria-label={t("city")}
          placeholder={t("city")}
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
          className="rounded-md border border-border-strong bg-surface-elevated p-2 text-body text-text-primary"
        />
        <input
          aria-label={t("countryCode")}
          placeholder={t("countryCode")}
          value={form.countryCode}
          onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
          className="rounded-md border border-border-strong bg-surface-elevated p-2 text-body text-text-primary"
        />
        <Button variant="secondary" isLoading={creating} onClick={createAddress} disabled={!form.addressLine || !form.city || !form.countryCode}>
          {t("save")}
        </Button>
      </ContextSurface>

      <div className="flex gap-3">
        <Button variant="ghost" onClick={onBack}>
          {tCommon("back")}
        </Button>
        <Button variant="primary" className="flex-1" onClick={onNext} disabled={!draft.customerAddressId}>
          {tCommon("continue")}
        </Button>
      </div>
    </div>
  );
}

function DateRangeStep({
  serviceId,
  error,
  setSubmitError,
  onHold,
}: {
  serviceId: string;
  error: string | null;
  setSubmitError: (message: string | null) => void;
  onHold: () => void;
}) {
  const t = useTranslations("services.booking.dateRange");
  const tErrors = useTranslations("services.booking");
  const tCommon = useTranslations("common");
  const draft = useBookingStore((s) => s);
  const updateBooking = useBookingStore((s) => s.update);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [isHolding, setIsHolding] = useState(false);

  async function submit() {
    if (!checkIn || !checkOut) return;
    setIsHolding(true);
    setSubmitError(null);
    try {
      const rangeStart = new Date(`${checkIn}T12:00:00Z`).toISOString();
      const rangeEnd = new Date(`${checkOut}T12:00:00Z`).toISOString();
      const hold = await bookingsService.createHold({
        petId: draft.petId!,
        providerId: draft.providerId!,
        locationId: draft.locationId!,
        serviceId,
        rangeStart,
        rangeEnd,
      });
      updateBooking({
        holdId: hold.holdId,
        holdExpiresAt: hold.expiresAt,
        slotStart: hold.slotStart,
        slotEnd: hold.slotEnd,
        timezone: hold.timezone,
        providerUserId: hold.providerUserId,
        confirmIdempotencyKey: crypto.randomUUID(),
      });
      onHold();
    } catch (err) {
      setSubmitError(mapError(err, tErrors));
    } finally {
      setIsHolding(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>
      {error ? (
        <p role="alert" className="text-metadata text-state-urgent">
          {error}
        </p>
      ) : null}
      <ContextSurface className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-metadata text-text-secondary">
          {t("checkIn")}
          <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="rounded-md border border-border-strong bg-surface-elevated p-2 text-body text-text-primary" />
        </label>
        <label className="flex flex-col gap-1 text-metadata text-text-secondary">
          {t("checkOut")}
          <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="rounded-md border border-border-strong bg-surface-elevated p-2 text-body text-text-primary" />
        </label>
      </ContextSurface>
      <Button variant="primary" isLoading={isHolding} disabled={!checkIn || !checkOut} onClick={submit}>
        {tCommon("continue")}
      </Button>
    </div>
  );
}

function SlotPickerStep({
  serviceId,
  error,
  setSubmitError,
  onHold,
}: {
  serviceId: string;
  error: string | null;
  setSubmitError: (message: string | null) => void;
  onHold: () => void;
}) {
  const t = useTranslations("services.booking.slotPicker");
  const tErrors = useTranslations("services.booking");
  const tCommon = useTranslations("common");
  const locale = useLocale() as "fa" | "en";
  const draft = useBookingStore((s) => s);
  const updateBooking = useBookingStore((s) => s.update);

  const [slots, setSlots] = useState<AvailabilitySlotDto[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isHolding, setIsHolding] = useState(false);

  async function load() {
    setLoadError(false);
    try {
      const from = new Date();
      const to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const response = await servicesService.getAvailability(serviceId, {
        locationId: draft.locationId!,
        from: from.toISOString(),
        to: to.toISOString(),
        petId: draft.petId ?? undefined,
      });
      setSlots(response.slots);
      if (!response.petCompatible) setLoadError(true);
    } catch {
      setLoadError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  const availableByDate = useMemo(() => {
    const map = new Map<string, AvailabilitySlotDto[]>();
    for (const slot of slots ?? []) {
      if (slot.state !== "AVAILABLE") continue;
      const key = formatDateKey(slot.startAt, slot.timezone);
      const list = map.get(key) ?? [];
      list.push(slot);
      map.set(key, list);
    }
    return map;
  }, [slots]);

  const dateKeys = Array.from(availableByDate.keys()).sort();
  const activeDate = selectedDate && availableByDate.has(selectedDate) ? selectedDate : dateKeys[0];

  async function onSelect(slot: AvailabilitySlotDto) {
    setIsHolding(true);
    setSubmitError(null);
    try {
      const hold = await bookingsService.createHold({
        petId: draft.petId!,
        providerId: draft.providerId!,
        locationId: draft.locationId!,
        serviceId,
        slotStart: slot.startAt,
        providerUserId: slot.providerUserId,
      });
      updateBooking({
        holdId: hold.holdId,
        holdExpiresAt: hold.expiresAt,
        slotStart: hold.slotStart,
        slotEnd: hold.slotEnd,
        timezone: hold.timezone,
        providerUserId: hold.providerUserId,
        confirmIdempotencyKey: crypto.randomUUID(),
      });
      onHold();
    } catch (err) {
      setSubmitError(mapError(err, tErrors));
    } finally {
      setIsHolding(false);
    }
  }

  if (loadError) return <ErrorRecovery title={tCommon("loading")} message={t("incompatible")} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!slots) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>
      {error ? (
        <p role="alert" className="text-metadata text-state-urgent">
          {error}
        </p>
      ) : null}

      {dateKeys.length === 0 ? (
        <EmptyState title={t("noSlots")} />
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto">
            {dateKeys.map((key) => {
              const sample = availableByDate.get(key)![0]!;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDate(key)}
                  className={`shrink-0 rounded-md border px-3 py-2 text-metadata ${
                    key === activeDate ? "border-brand-mint bg-brand-mint/10 text-text-primary" : "border-border-subtle text-text-secondary"
                  }`}
                >
                  {formatDayLabel(sample.startAt, locale, sample.timezone)}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(availableByDate.get(activeDate!) ?? []).map((slot) => (
              <Button key={slot.startAt} variant="secondary" isLoading={isHolding} onClick={() => onSelect(slot)}>
                {formatTimeLabel(slot.startAt, locale, slot.timezone)}
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const ERROR_KEYS = new Set([
  "SLOT_UNAVAILABLE",
  "HOLD_EXPIRED",
  "BOOKING_CONFLICT",
  "PROVIDER_NOT_VERIFIED",
  "SERVICE_NOT_AVAILABLE",
  "PET_NOT_SUPPORTED",
  "PET_ACCESS_DENIED",
  "PET_CONTEXT_INCOMPLETE",
  "ADDRESS_REQUIRED",
  "BOOKING_NOT_CANCELLABLE",
]);

function mapError(err: unknown, t: (key: string) => string): string {
  if (err instanceof ApiError && ERROR_KEYS.has(err.code)) {
    return t(`errors.${err.code}`);
  }
  if (err instanceof ApiError) return err.message;
  return "Something went wrong. Please try again.";
}
