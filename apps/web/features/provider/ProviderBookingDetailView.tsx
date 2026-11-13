"use client";
import {ProviderCareSuggestionForm} from "@/features/health-depth/ProviderCareSuggestionForm";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Avatar, Button, ContextSurface, Dialog, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import type { ProviderBookingDetailDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { providerOsService } from "@/services/provider-os.service";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { formatAge, formatWeight, speciesLabel } from "@/features/pets/pet-identity";
import { documentTypeLabel } from "@/features/health-advanced/document-labels";
import { useInstantFormat } from "@/lib/date/use-instant-format";
import { formatAppointmentDateTime } from "@/lib/date/appointment-date";
import { bookingStatusTone } from "@/features/discovery/labels";
import type { ProviderFollowUpInput } from "@/services/provider-os.service";
import { DateField } from "@/features/shared/date-picker/DateField";

const ACCESS_TONE: Record<string, "success" | "attention" | "neutral"> = {
  GRANTED: "success",
  NO_GRANT: "neutral",
  EXPIRED: "attention",
  REVOKED: "attention",
};

const ERROR_KEYS = new Set([
  "PROVIDER_ACCESS_DENIED",
  "PROVIDER_NOT_VERIFIED",
  "BOOKING_NOT_FOUND",
  "INVALID_BOOKING_TRANSITION",
  "BOOKING_NOT_CANCELLABLE",
]);

function mapError(err: unknown, t: (key: string) => string): string {
  if (err instanceof ApiError && ERROR_KEYS.has(err.code)) return t(`errors.${err.code}`);
  return t("errors.generic");
}

/**
 * Booking Detail + permissioned Pet context (spec sections 12-14) — the
 * access section always renders one of four explicit states, never a
 * boolean that hides the reason ("no invisible provider access").
 */
export function ProviderBookingDetailView({ bookingId }: { bookingId: string }) {
  const t = useTranslations("provider.bookingDetail");
  const tStatus = useTranslations("provider.bookings.status");
  const tPayment = useTranslations("provider.bookings.paymentStatus");
  const tKnowledge = useTranslations("health.knowledgeState");
  const tVaccination = useTranslations("health.vaccinationStatus");
  const tSeverity = useTranslations("healthShares.severity");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en" | "de" | "es";
  const fmt = useInstantFormat();
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [detail, setDetail] = useState<ProviderBookingDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [completionNote, setCompletionNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [followUps, setFollowUps] = useState<ProviderFollowUpInput[]>([]);

  async function load() {
    setError(null);
    setDetail(null);
    try {
      setDetail(await providerOsService.getBooking(bookingId));
    } catch (err) {
      setError(mapError(err, t));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  async function runAction(action: () => Promise<ProviderBookingDetailDto>, successKey?: string) {
    setIsActing(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const updated = await action();
      setDetail(updated);
      if (successKey) setActionMessage(t(successKey));
    } catch (err) {
      setActionError(mapError(err, t));
    } finally {
      setIsActing(false);
    }
  }

  if (error) return <ErrorRecovery title={t("title")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!detail) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  const { booking, pet, access, careProfile, healthSummary, healthDetails, intake, providerNotes } = detail;
  const isCancellable = ["CONFIRMED", "CHECKED_IN", "AWAITING_PAYMENT"].includes(booking.bookingStatus);
  const started = new Date(booking.startAt).getTime() <= Date.now();
  // The clinical record reads health: offer it only when this booking's grant actually includes health.
  const healthGranted = access.state === "GRANTED" && access.canViewHealth;
  const identity = pet.identity;
  const notRecorded = t("petInfo.notRecorded");

  async function download(documentId: string) {
    setDownloadError(null);
    try {
      const target = await healthAdvancedService.downloadDocument(pet.id, documentId);
      window.open(target.downloadUrl, "_blank", "noopener,noreferrer");
    } catch {
      setDownloadError(t("documents.downloadFailed"));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ProviderCareSuggestionForm source="booking" sourceId={booking.id} completed={booking.bookingStatus === "COMPLETED"}/>
      <div>
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <StatusLabel tone={bookingStatusTone(booking.bookingStatus)}>{tStatus(booking.bookingStatus)}</StatusLabel>
          {booking.bookingNumber ? <span className="text-sm text-text-secondary" dir="ltr">{booking.bookingNumber}</span> : null}
          <StatusLabel tone="neutral">{tPayment(booking.paymentStatus)}</StatusLabel>
        </div>
      </div>

      <ContextSurface className="flex flex-col gap-3">
        <Row label={t("pet")} value={pet.name} />
        <Row label={t("owner")} value={booking.ownerDisplayName} />
        <Row label={t("service")} value={booking.variantName ? `${booking.serviceName} — ${booking.variantName}` : booking.serviceName} />
        {booking.bookingStatus === "REQUESTED" && booking.requestExpiresAt ? <Row label={t("respondBy")} value={formatAppointmentDateTime(booking.requestExpiresAt, locale, booking.timezone)} /> : null}
        <Row label={t("location")} value={booking.locationLabel} />
        <Row label={t("dateTime")} value={formatAppointmentDateTime(booking.startAt, locale, booking.timezone)} />
        {booking.reasonForVisit ? <Row label={t("reason")} value={booking.reasonForVisit} /> : null}
        {booking.ownerNotes ? <Row label={t("ownerNotes")} value={booking.ownerNotes} /> : null}
        {booking.cancelledReason ? <Row label={t("cancelledReason")} value={booking.cancelledReason} /> : null}
        {booking.completionNote ? <Row label={t("completionNote")} value={booking.completionNote} /> : null}
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={pet.name} src={pet.photoUrl} size="lg" className="shrink-0" />
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-section-title text-text-primary" dir="auto">{pet.name}</h2>
            <p className="text-metadata text-text-secondary">{[speciesLabel(pet, locale), pet.breed].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        {identity ? (
          <dl className="grid grid-cols-2 gap-3 border-t border-border-subtle pt-3">
            <Fact label={t("petInfo.sex")} value={identity.sex ? t(`petInfo.sexValue.${identity.sex}`) : notRecorded} />
            <Fact label={t("petInfo.age")} value={formatAge(identity, locale, notRecorded)} />
            <Fact label={t("petInfo.weight")} value={formatWeight(identity, locale, notRecorded)} />
            <Fact label={t("petInfo.microchip")} value={identity.hasMicrochip ? t("petInfo.microchipPresent") : notRecorded} />
          </dl>
        ) : (
          <p className="text-metadata text-text-secondary">{t("petInfo.moreAfterAssignment")}</p>
        )}
      </ContextSurface>

      {intake && intake.answers.length ? (
        <ContextSurface className="flex flex-col gap-2">
          <h2 className="text-section-title text-text-primary">{t("intake.title")}</h2>
          {intake.answers.map((answer) => (
            <Row key={answer.key} label={answer.label} value={intakeValue(answer.value, { yes: t("intake.yes"), no: t("intake.no"), separator: locale === "fa" ? "، " : ", " })} />
          ))}
        </ContextSurface>
      ) : null}

      <ContextSurface className="flex flex-col gap-2">
        <h2 className="text-section-title text-text-primary">{t("access.title")}</h2>
        <StatusLabel tone={ACCESS_TONE[access.state] ?? "neutral"}>{t(`access.state.${access.state}`)}</StatusLabel>
        {access.state === "GRANTED" ? (
          <>
            <Row label={t("access.scope")} value={access.scopePreset ? t(`access.scopePreset.${access.scopePreset}`) : ""} />
            <Row label={t("access.startsAt")} value={access.startsAt ? formatAppointmentDateTime(access.startsAt, locale, booking.timezone) : ""} />
            <Row label={t("access.expiresAt")} value={access.expiresAt ? formatAppointmentDateTime(access.expiresAt, locale, booking.timezone) : ""} />
          </>
        ) : null}
        {access.state === "GRANTED" && booking.category === "VET" && !access.canViewHealth ? (
          <p className="text-metadata text-text-secondary">{t("health.identityOnly")}</p>
        ) : null}
        {healthGranted && booking.category === "VET" ? (
          <Button variant="secondary" onClick={() => router.push(`/${locale}/provider/patients/${pet.id}`)}>
            {t("access.openClinicalRecord")}
          </Button>
        ) : null}
      </ContextSurface>

      {careProfile ? (
        <ContextSurface className="flex flex-col gap-2">
          <h2 className="text-section-title text-text-primary">{t("careProfile.title")}</h2>
          {careProfile.temperamentText ? <Row label={t("careProfile.temperament")} value={careProfile.temperamentText} /> : null}
          {careProfile.feedingRoutineText ? <Row label={t("careProfile.feeding")} value={careProfile.feedingRoutineText} /> : null}
          {careProfile.specialInstructionsText ? <Row label={t("careProfile.specialInstructions")} value={careProfile.specialInstructionsText} /> : null}
        </ContextSurface>
      ) : null}

      {healthSummary ? (
        <ContextSurface className="flex flex-col gap-3">
          <h2 className="text-section-title text-text-primary">{t("health.title")}</h2>
          {healthDetails ? (
            <>
              <HealthList
                title={t("health.allergies")}
                empty={tKnowledge(healthSummary.allergyState)}
                items={healthDetails.allergies.map((a) => ({ id: a.id, text: [a.name, a.severity ? tSeverity(a.severity) : null, a.reaction].filter(Boolean).join(" · ") }))}
              />
              <HealthList
                title={t("health.conditions")}
                empty={tKnowledge(healthSummary.conditionsState)}
                items={healthDetails.conditions.map((c) => ({ id: c.id, text: c.notes ? `${c.name} · ${c.notes}` : c.name }))}
              />
              <HealthList
                title={t("health.medications")}
                empty={tKnowledge(healthSummary.medicationsState)}
                items={healthDetails.medications.map((m) => ({ id: m.id, text: [m.name, m.dosage !== null ? `${fmt.number(m.dosage)} ${m.unit ?? ""}`.trim() : null, m.frequencyText].filter(Boolean).join(" · ") }))}
              />
              <div className="flex flex-col gap-1 border-t border-border-subtle pt-3">
                <Row label={t("health.vaccinationStatus")} value={tVaccination(healthDetails.vaccination.status)} />
                <Row label={t("health.vaccinationLast")} value={healthDetails.vaccination.lastKnownDate ? fmt.date(healthDetails.vaccination.lastKnownDate) : notRecorded} />
                <Row label={t("health.vaccinationNext")} value={healthDetails.vaccination.nextDueDate ? fmt.date(healthDetails.vaccination.nextDueDate) : notRecorded} />
              </div>
            </>
          ) : (
            <>
              <Row label={t("health.allergyState")} value={tKnowledge(healthSummary.allergyState)} />
              <Row label={t("health.vaccinationStatus")} value={tVaccination(healthSummary.vaccinationStatus)} />
            </>
          )}
        </ContextSurface>
      ) : null}

      {healthDetails && healthDetails.sharedDocuments.length ? (
        <ContextSurface className="flex flex-col gap-3">
          <h2 className="text-section-title text-text-primary">{t("documents.title")}</h2>
          {healthDetails.sharedDocuments.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-2 first-of-type:border-t-0 first-of-type:pt-0">
              <div className="flex min-w-0 flex-col">
                <span className="text-body text-text-primary" dir="auto">{d.title}</span>
                <span className="text-metadata text-text-secondary">{[documentTypeLabel(d.documentType, locale), fmt.date(d.recordedAt ?? d.uploadedAt)].join(" · ")}</span>
              </div>
              <Button variant="secondary" size="sm" onClick={() => void download(d.id)}>{t("documents.download")}</Button>
            </div>
          ))}
          {downloadError ? <p role="alert" className="text-metadata text-state-urgent">{downloadError}</p> : null}
        </ContextSurface>
      ) : null}

      {actionError ? <StatusLabel tone="attention">{actionError}</StatusLabel> : null}
      {actionMessage ? <StatusLabel tone="success">{actionMessage}</StatusLabel> : null}

      <div className="flex flex-wrap gap-2">
        {booking.bookingStatus === "REQUESTED" ? (
          <>
            <Button variant="primary" isLoading={isActing} onClick={() => runAction(() => providerOsService.acceptBooking(booking.id))}>{t("actions.acceptRequest")}</Button>
            <Button variant="ghost" onClick={() => setShowRejectDialog(true)}>{t("actions.decline")}</Button>
          </>
        ) : null}
        {booking.bookingStatus === "CONFIRMED" ? (
          <Button variant="secondary" isLoading={isActing} onClick={() => runAction(() => providerOsService.confirmBooking(booking.id), "actions.confirmed")}>
            {t("actions.confirm")}
          </Button>
        ) : null}
        {booking.bookingStatus === "CONFIRMED" && started ? (
          <Button variant="ghost" isLoading={isActing} onClick={() => runAction(() => providerOsService.markNoShow(booking.id))}>{t("actions.markNoShow")}</Button>
        ) : null}
        {booking.category === "VET" && ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS"].includes(booking.bookingStatus) && healthGranted ? (
          <Button variant="secondary" onClick={() => router.push(`/${locale}/provider/patients/${pet.id}?startVisitForBooking=${booking.id}`)}>{t("actions.startClinicalVisit")}</Button>
        ) : null}
        {booking.bookingStatus === "CONFIRMED" ? (
          <Button variant="primary" isLoading={isActing} onClick={() => runAction(() => providerOsService.checkIn(booking.id))}>
            {t("actions.checkIn")}
          </Button>
        ) : null}
        {booking.bookingStatus === "CHECKED_IN" ? (
          <Button variant="primary" isLoading={isActing} onClick={() => runAction(() => providerOsService.start(booking.id))}>
            {t("actions.start")}
          </Button>
        ) : null}
        {booking.bookingStatus === "IN_PROGRESS" ? (
          <Button variant="primary" isLoading={isActing} onClick={() => runAction(() => providerOsService.completeWithFollowUps(booking.id, completionNote || undefined, followUps.filter((f) => f.title.trim() && f.dueAt)))}>
            {t("actions.complete")}
          </Button>
        ) : null}
        {isCancellable ? (
          <Button variant="ghost" onClick={() => setShowCancelDialog(true)}>
            {t("actions.cancel")}
          </Button>
        ) : null}
      </div>

      {booking.bookingStatus === "IN_PROGRESS" ? (
        <ContextSurface className="flex flex-col gap-2">
          <Input
            label={t("completionNoteLabel")}
            value={completionNote}
            onChange={(e) => setCompletionNote(e.target.value)}
            placeholder={t("completionNotePlaceholder")}
          />
          {booking.category === "VET" ? (
            <fieldset className="flex flex-col gap-2 border-t border-border-subtle pt-3">
              <legend className="font-bold">{t("followUps.legend")}</legend>
              <p className="text-sm text-text-secondary">{t("followUps.description")}</p>
              {followUps.map((f, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[10rem_1fr_12rem_auto]">
                  <select aria-label={t("followUps.typeLabel")} className="rounded border border-border-subtle bg-surface-base p-2" value={f.type} onChange={(e) => setFollowUps((prev) => prev.map((x, j) => (j === i ? { ...x, type: e.target.value as ProviderFollowUpInput["type"] } : x)))}>
                    <option value="FOLLOW_UP">{t("followUps.type.FOLLOW_UP")}</option>
                    <option value="VACCINATION">{t("followUps.type.VACCINATION")}</option>
                    <option value="MEDICATION">{t("followUps.type.MEDICATION")}</option>
                    <option value="MONITORING">{t("followUps.type.MONITORING")}</option>
                    <option value="OTHER">{t("followUps.type.OTHER")}</option>
                  </select>
                  <input aria-label={t("followUps.titleLabel")} className="rounded border border-border-subtle bg-surface-base p-2" maxLength={200} value={f.title} onChange={(e) => setFollowUps((prev) => prev.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                  <DateField label={t("followUps.dateLabel")} min={new Date(Date.now() + 86400_000).toISOString().slice(0, 10)} value={f.dueAt.slice(0, 10)} onChange={(date) => setFollowUps((prev) => prev.map((x, j) => (j === i ? { ...x, dueAt: date ? new Date(`${date}T06:30:00Z`).toISOString() : "" } : x)))} />
                  <Button variant="ghost" size="sm" onClick={() => setFollowUps((prev) => prev.filter((_, j) => j !== i))}>{t("followUps.remove")}</Button>
                </div>
              ))}
              {followUps.length < 10 ? <Button variant="secondary" size="sm" onClick={() => setFollowUps((prev) => [...prev, { type: "FOLLOW_UP", title: "", dueAt: "" }])}>{t("followUps.add")}</Button> : null}
            </fieldset>
          ) : null}
        </ContextSurface>
      ) : null}

      <Dialog open={showRejectDialog} onClose={() => setShowRejectDialog(false)} title={t("rejectDialog.title")}>
        <div className="flex flex-col gap-3">
          <Input label={t("rejectDialog.reasonLabel")} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          <Button disabled={!rejectReason.trim()} isLoading={isActing} onClick={() => runAction(() => providerOsService.rejectBooking(booking.id, rejectReason.trim())).then(() => setShowRejectDialog(false))}>{t("actions.decline")}</Button>
        </div>
      </Dialog>

      <ContextSurface className="flex flex-col gap-3">
        <h2 className="text-section-title text-text-primary">{t("notes.title")}</h2>
        <p className="text-metadata text-text-secondary">{t("notes.internalOnly")}</p>
        <div className="flex items-end gap-2">
          <Input
            label={t("notes.label")}
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder={t("notes.placeholder")}
            className="flex-1"
          />
          <Button
            variant="secondary"
            disabled={!noteContent.trim()}
            onClick={async () => {
              await providerOsService.addNote(booking.id, noteContent.trim());
              setNoteContent("");
              await load();
            }}
          >
            {t("notes.add")}
          </Button>
        </div>
        {providerNotes.length === 0 ? (
          <p className="text-metadata text-text-secondary">{t("notes.empty")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {providerNotes.map((note) => (
              <div key={note.id} className="border-t border-border-subtle pt-2">
                <p className="text-body text-text-primary">{note.content}</p>
                <p className="text-metadata text-text-secondary">{formatAppointmentDateTime(note.createdAt, locale, booking.timezone)}</p>
              </div>
            ))}
          </div>
        )}
      </ContextSurface>

      <Dialog open={showCancelDialog} onClose={() => setShowCancelDialog(false)} title={t("cancelDialog.title")}>
        <div className="flex flex-col gap-4">
          <p className="text-body text-text-secondary">{t("cancelDialog.body")}</p>
          <Input
            label={t("cancelDialog.reasonLabel")}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder={t("cancelDialog.reasonPlaceholder")}
          />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setShowCancelDialog(false)}>
              {tCommon("cancel")}
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              isLoading={isActing}
              onClick={() =>
                runAction(() => providerOsService.cancelBooking(booking.id, cancelReason || undefined)).then(() => setShowCancelDialog(false))
              }
            >
              {t("cancelDialog.confirm")}
            </Button>
          </div>
        </div>
      </Dialog>

      <Button variant="ghost" onClick={() => router.push(`/${locale}/provider/bookings`)}>
        {t("backToQueue")}
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-metadata text-text-secondary">{label}</span>
      <span className="text-body text-end text-text-primary" dir="auto">{value}</span>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-metadata text-text-secondary">{label}</dt>
      <dd className="text-body text-text-primary">{value}</dd>
    </div>
  );
}

/** An empty list shows the owner's recorded knowledge state ("None known", "Not recorded yet"), never an implied "none". */
function HealthList({ title, empty, items }: { title: string; empty: string; items: { id: string; text: string }[] }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-metadata font-bold text-text-secondary">{title}</h3>
      {items.length ? (
        <ul className="flex flex-col gap-1">
          {items.map((item) => <li key={item.id} className="text-body text-text-primary" dir="auto">{item.text}</li>)}
        </ul>
      ) : (
        <p className="text-body text-text-secondary">{empty}</p>
      )}
    </div>
  );
}

/** Intake answers are owner-written data: shown as given, with booleans and lists made readable. */
function intakeValue(value: unknown, words: { yes: string; no: string; separator: string }): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? words.yes : words.no;
  if (Array.isArray(value)) return value.map(String).join(words.separator);
  return String(value);
}
