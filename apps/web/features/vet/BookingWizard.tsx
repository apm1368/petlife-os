"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import { PetAccessScopePreset, type AvailabilitySlotDto, type PetDto } from "@petlife/types";
import { formatAppointmentDateTime, formatDateKey, formatDayLabel, formatTimeLabel } from "@/lib/date/appointment-date";
import { providersService } from "@/services/providers.service";
import { bookingsService } from "@/services/bookings.service";
import { petsService } from "@/services/pets.service";
import { ApiError } from "@/lib/api/client";
import { useBookingStore } from "@/stores/booking-store";

type Step = "slot" | "review" | "health-sharing" | "submitting";

const SCOPE_PRESETS = [
  PetAccessScopePreset.MINIMAL_VET_CONTEXT,
  PetAccessScopePreset.HEALTH_BASICS,
  PetAccessScopePreset.SELECTED_HEALTH_DATA,
];

export function BookingWizard({ providerId }: { providerId: string }) {
  const t = useTranslations("vet.booking");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";
  const draft = useBookingStore((s) => s);
  const updateBooking = useBookingStore((s) => s.update);
  const resetBooking = useBookingStore((s) => s.reset);

  const [step, setStep] = useState<Step>("slot");
  const [pet, setPet] = useState<PetDto | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (draft.petId) void petsService.getById(draft.petId).then(setPet);
  }, [draft.petId]);

  if (!draft.petId || !draft.locationId || !draft.serviceId || draft.providerId !== providerId) {
    return <EmptyState title={t("noDraft")} actionLabel={t("backToProfile")} onAction={() => router.push(`/${locale}/vet/${providerId}`)} />;
  }

  async function onSlotSelected(slot: AvailabilitySlotDto) {
    try {
      const hold = await bookingsService.createHold({
        petId: draft.petId!,
        providerId,
        locationId: draft.locationId!,
        serviceId: draft.serviceId!,
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
      setStep("review");
    } catch (err) {
      setSubmitError(mapError(err, t));
    }
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
        },
        draft.confirmIdempotencyKey,
      );
      resetBooking();
      router.push(`/${locale}/bookings/${booking.id}?confirmed=1`);
    } catch (err) {
      setSubmitError(mapError(err, t));
      setStep("health-sharing");
    }
  }

  if (step === "slot") {
    return <SlotPickerStep providerId={providerId} error={submitError} onSelect={onSlotSelected} />;
  }

  if (step === "review") {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-page-title text-text-primary">{t("review.title")}</h1>
        <ContextSurface className="flex flex-col gap-3">
          <Row label={t("review.pet")} value={pet?.name ?? "…"} />
          <Row label={t("review.provider")} value={draft.providerName} />
          <Row label={t("review.service")} value={draft.serviceName} />
          <Row label={t("review.location")} value={draft.locationLabel} />
          <Row
            label={t("review.dateTime")}
            value={draft.slotStart && draft.timezone ? formatAppointmentDateTime(draft.slotStart, locale, draft.timezone) : "…"}
          />
          {draft.priceAmount ? (
            <Row label={t("review.price")} value={`${draft.priceAmount.toLocaleString(locale)} ${draft.currency ?? ""}`} />
          ) : null}
          <Row label={t("review.paymentStatus")} value={t("review.paymentPlaceholder")} />
        </ContextSurface>
        <ContextSurface className="flex flex-col gap-2">
          <label htmlFor="reasonForVisit" className="text-metadata text-text-secondary">
            {t("review.reasonLabel")}
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
          <Button variant="ghost" onClick={() => setStep("slot")}>
            {tCommon("back")}
          </Button>
          <Button variant="primary" className="flex-1" onClick={() => setStep("health-sharing")}>
            {tCommon("continue")}
          </Button>
        </div>
      </div>
    );
  }

  // health-sharing and submitting
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("healthSharing.title")}</h1>
      <ContextSurface className="flex flex-col gap-2">
        <Row label={t("healthSharing.who")} value={draft.providerName} />
        <Row label={t("healthSharing.why")} value={t("healthSharing.whyValue")} />
        <Row
          label={t("healthSharing.until")}
          value={draft.slotEnd && draft.timezone ? formatAppointmentDateTime(draft.slotEnd, locale, draft.timezone) : "…"}
        />
      </ContextSurface>

      <div className="flex flex-col gap-2">
        <p className="text-metadata text-text-secondary">{t("healthSharing.what")}</p>
        {SCOPE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => updateBooking({ accessSelection: preset })}
            className="w-full text-start"
          >
            <ContextSurface className={`flex items-center justify-between gap-3 ${draft.accessSelection === preset ? "border-brand-mint" : ""}`}>
              <div>
                <p className="text-body text-text-primary">{t(`healthSharing.preset.${preset}.title`)}</p>
                <p className="text-metadata text-text-secondary">{t(`healthSharing.preset.${preset}.description`)}</p>
              </div>
              {draft.accessSelection === preset ? <StatusLabel tone="success">{tCommon("selected")}</StatusLabel> : null}
            </ContextSurface>
          </button>
        ))}
      </div>

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
          {t("healthSharing.confirm")}
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

function SlotPickerStep({
  providerId,
  error,
  onSelect,
}: {
  providerId: string;
  error: string | null;
  onSelect: (slot: AvailabilitySlotDto) => void;
}) {
  const t = useTranslations("vet.booking.slotPicker");
  const tCommon = useTranslations("common");
  const locale = useLocale() as "fa" | "en";
  const draft = useBookingStore((s) => s);

  const [slots, setSlots] = useState<AvailabilitySlotDto[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isHolding, setIsHolding] = useState(false);

  async function load() {
    setLoadError(false);
    try {
      const from = new Date();
      const to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const response = await providersService.getAvailability(providerId, {
        locationId: draft.locationId!,
        serviceId: draft.serviceId!,
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
  }, [providerId]);

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
              <Button
                key={slot.startAt}
                variant="secondary"
                isLoading={isHolding}
                onClick={async () => {
                  setIsHolding(true);
                  try {
                    await onSelect(slot);
                  } finally {
                    setIsHolding(false);
                  }
                }}
              >
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
  "BOOKING_NOT_CANCELLABLE",
]);

function mapError(err: unknown, t: (key: string) => string): string {
  if (err instanceof ApiError && ERROR_KEYS.has(err.code)) {
    return t(`errors.${err.code}`);
  }
  if (err instanceof ApiError) return err.message;
  return "Something went wrong. Please try again.";
}
