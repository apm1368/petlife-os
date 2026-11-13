"use client";

import { useState } from "react";
import { useLocalizedRouter as useRouter } from "@/features/navigation/localized-link";
import { useLocale, useTranslations } from "next-intl";
import type { RouteLocale } from "@/lib/i18n/config";
import { Button, ContextSurface } from "@petlife/ui";
import { lostPetService } from "@/services/lost-pet.service";
import { DateRangeField } from "@/features/shared/date-picker/DateRangePicker";
import { addDays, formatDay, todayIso } from "@/lib/date/jalali";
import { TimeSelect } from "@/features/shared/date-picker/TimeSelect";
import { FilePicker } from "@/features/shared/FilePicker";

type Step = "where" | "photo" | "describe" | "contact" | "review";
const STEPS: Step[] = ["where", "photo", "describe", "contact", "review"];
type Contact = "IN_APP_MESSAGE" | "MASKED_CONTACT" | "PUBLIC_CONTACT";

/** Tehran wall-clock date + time → ISO instant. */
function toInstant(day: string, time: string): string {
  return new Date(`${day}T${time || "12:00"}:00+03:30`).toISOString();
}

/**
 * LOST INCIDENT PATTERN — create. Calm, step by step, and explicit about what becomes public:
 * the approximate area, photo, description and public notes are public; the exact place,
 * private notes and contact details are not (unless the owner chooses a public contact line).
 */
export function ReportLostPetView({ petId }: { petId: string }) {
  const t = useTranslations("lostPet");
  const tCommon = useTranslations("common");
  const lang = useLocale() as RouteLocale;
  const router = useRouter();

  const [step, setStep] = useState<Step>("where");
  const [publicArea, setPublicArea] = useState("");
  const [lastKnownLocation, setLastKnownLocation] = useState("");
  // #290 Q53: an optional private point (never public) so neighbours who opted in can be alerted.
  const [point, setPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState<"idle" | "busy" | "denied">("idle");
  const [seenDay, setSeenDay] = useState<string | null>(todayIso());
  const [seenTime, setSeenTime] = useState("");
  // Kept in state: the file input unmounts when the user moves to the next step.
  const [photo, setPhoto] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [publicNotes, setPublicNotes] = useState("");
  const [privateNotes, setPrivateNotes] = useState("");
  const [contactPreference, setContactPreference] = useState<Contact>("IN_APP_MESSAGE");
  const [publicContactMode, setPublicContactMode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const index = STEPS.indexOf(step);
  const canContinue = step === "describe" ? description.trim().length > 0 : step === "contact" ? contactPreference !== "PUBLIC_CONTACT" || publicContactMode.trim().length > 0 : true;

  async function handleSubmit(): Promise<void> {
    if (!description.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      let primaryPhotoObjectKey: string | undefined;
      const file = photo;
      if (file) {
        const target = await lostPetService.requestPhotoUpload(petId, file.type, file.size);
        await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: file });
        primaryPhotoObjectKey = target.key;
      }
      const incident = await lostPetService.open(petId, {
        description: description.trim(),
        publicArea: publicArea.trim() || undefined,
        lastKnownLocation: lastKnownLocation.trim() || undefined,
        lastKnownLatitude: point?.latitude,
        lastKnownLongitude: point?.longitude,
        lastSeenAt: seenDay ? toInstant(seenDay, seenTime) : undefined,
        publicNotes: publicNotes.trim() || undefined,
        privateNotes: privateNotes.trim() || undefined,
        contactPreference,
        publicContactMode: contactPreference === "PUBLIC_CONTACT" ? publicContactMode.trim() : undefined,
        primaryPhotoObjectKey,
      });
      router.push(`/pets/${petId}/lost/${incident.id}`);
    } catch {
      setError(tCommon("genericError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  const PublicTag = () => <span className="ms-2 rounded-full bg-state-attention/10 px-2 py-0.5 text-metadata text-state-attention">{t("report.publicTag")}</span>;
  const PrivateTag = () => <span className="ms-2 rounded-full bg-surface-subtle px-2 py-0.5 text-metadata text-text-secondary">{t("report.privateTag")}</span>;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("report.title")}</h1>
      <p className="text-body text-text-secondary">{t("report.subtitle")}</p>
      <ol className="flex gap-2 overflow-x-auto text-metadata" aria-label={t("report.stepsLabel")}>
        {STEPS.map((s, i) => (
          <li key={s} aria-current={s === step ? "step" : undefined} className={`shrink-0 rounded-full px-3 py-1 ${s === step ? "bg-brand-solid text-on-brand" : i < index ? "bg-surface-subtle text-text-primary" : "text-text-secondary"}`}>
            {i < index ? "✓ " : ""}
            {t(`report.steps.${s}`)}
          </li>
        ))}
      </ol>

      <ContextSurface className="flex flex-col gap-4">
        {step === "where" ? (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-text-primary">{t("report.approximateArea")}<PublicTag /></span>
              <input dir="auto" maxLength={120} value={publicArea} onChange={(e) => setPublicArea(e.target.value)} placeholder={t("report.approximateAreaPlaceholder")} className="min-h-12 rounded-md border border-border-subtle bg-surface-base px-3" />
              <span className="text-metadata text-text-secondary">{t("report.approximateAreaHelp")}</span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-text-primary">{t("report.exactLastSeenPlace")}<PrivateTag /></span>
              <input dir="auto" maxLength={300} value={lastKnownLocation} onChange={(e) => setLastKnownLocation(e.target.value)} className="min-h-12 rounded-md border border-border-subtle bg-surface-base px-3" />
              <span className="text-metadata text-text-secondary">{t("report.exactPlaceHelp")}</span>
            </label>
            <div className="flex flex-col gap-1 text-sm">
              <button type="button" className="btn-quiet self-start" disabled={locating === "busy"} onClick={() => {
                if (!("geolocation" in navigator)) { setLocating("denied"); return; }
                setLocating("busy");
                navigator.geolocation.getCurrentPosition(
                  (pos) => { setPoint({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }); setLocating("idle"); },
                  () => setLocating("denied"),
                  { enableHighAccuracy: true, timeout: 15000 },
                );
              }}>{point ? t("report.locationSaved") : t("report.useMyLocation")}<PrivateTag /></button>
              <span className="text-metadata text-text-secondary">{locating === "denied" ? t("report.locationDenied") : t("report.useMyLocationHelp")}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <DateRangeField mode="single" label={t("report.lastSeenAtLabel")} value={{ start: seenDay, end: null }} onChange={(v) => setSeenDay(v.start)} min={addDays(todayIso(), -60)} max={todayIso()} />
              <TimeSelect label={t("report.approximateTime")} value={seenTime} onChange={setSeenTime} />
            </div>
          </>
        ) : null}

        {step === "photo" ? (
          <div className="flex flex-col gap-2">
            <FilePicker label={<>{t("report.photoLabel")}<PublicTag /></>} aria-label={t("report.photoLabel")} accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            <p className="text-metadata text-text-secondary">{t("report.photoHelp")}</p>
          </div>
        ) : null}

        {step === "describe" ? (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-text-primary">{t("report.descriptionLabel")}<PublicTag /></span>
              <textarea dir="auto" maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("report.descriptionPlaceholder")} className="min-h-24 rounded-md border border-border-subtle bg-surface-base p-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-text-primary">{t("report.publicNote")}<PublicTag /></span>
              <textarea dir="auto" maxLength={2000} value={publicNotes} onChange={(e) => setPublicNotes(e.target.value)} placeholder={t("report.publicNotePlaceholder")} className="min-h-20 rounded-md border border-border-subtle bg-surface-base p-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-text-primary">{t("report.privateNote")}<PrivateTag /></span>
              <textarea dir="auto" maxLength={2000} value={privateNotes} onChange={(e) => setPrivateNotes(e.target.value)} placeholder={t("report.privateNotePlaceholder")} className="min-h-16 rounded-md border border-border-subtle bg-surface-base p-2" />
            </label>
          </>
        ) : null}

        {step === "contact" ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-medium text-text-primary">{t("report.contactPreferenceLabel")}</legend>
            {([
              ["IN_APP_MESSAGE", t("report.contactPreference.inAppMessage"), t("report.contactPreferenceHelp.inAppMessage")],
              ["MASKED_CONTACT", t("report.contactPreference.maskedContact"), t("report.contactPreferenceHelp.maskedContact")],
              ["PUBLIC_CONTACT", t("report.contactPreference.publicContact"), t("report.contactPreferenceHelp.publicContact")],
            ] as [Contact, string, string][]).map(([value, label, hint]) => (
              <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm ${contactPreference === value ? "border-brand-natural" : "border-border-subtle"}`}>
                <input type="radio" name="contact" className="mt-1 h-5 w-5" checked={contactPreference === value} onChange={() => setContactPreference(value)} />
                <span className="flex flex-col"><span className="font-medium">{label}</span><span className="text-text-secondary">{hint}</span></span>
              </label>
            ))}
            {contactPreference === "PUBLIC_CONTACT" ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{t("report.publicContactLine")}<PublicTag /></span>
                <input dir="auto" maxLength={120} value={publicContactMode} onChange={(e) => setPublicContactMode(e.target.value)} placeholder={t("report.publicContactPlaceholder")} className="min-h-12 rounded-md border border-border-subtle bg-surface-base px-3" />
                <span className="text-metadata text-state-attention">{t("report.publicContactWarning")}</span>
              </label>
            ) : null}
          </fieldset>
        ) : null}

        {step === "review" ? (
          <div className="flex flex-col gap-3 text-sm">
            <h2 className="font-bold">{t("report.reviewTitle")}</h2>
            <dl className="grid gap-1">
              <div><dt className="inline text-text-secondary">{t("report.review.area")}: </dt><dd className="inline">{publicArea.trim() || t("report.notGiven")}</dd></div>
              <div><dt className="inline text-text-secondary">{t("report.review.when")}: </dt><dd className="inline">{seenDay ? `${formatDay(seenDay, lang)}${seenTime ? ` ${seenTime}` : ""}` : "—"}</dd></div>
              <div><dt className="inline text-text-secondary">{t("report.review.photo")}: </dt><dd className="inline">{photo?.name ?? t("report.noPhoto")}</dd></div>
              <div><dt className="inline text-text-secondary">{t("report.descriptionLabel")}: </dt><dd className="inline">{description}</dd></div>
              {publicNotes.trim() ? <div><dt className="inline text-text-secondary">{t("report.publicNote")}: </dt><dd className="inline">{publicNotes}</dd></div> : null}
              <div><dt className="inline text-text-secondary">{t("report.review.contact")}: </dt><dd className="inline">{contactPreference === "PUBLIC_CONTACT" ? publicContactMode : t("report.contactThroughApp")}</dd></div>
            </dl>
            <p className="rounded-md bg-surface-subtle p-3 text-text-secondary">{t("report.privacyNotice")}</p>
          </div>
        ) : null}

        {error ? <p role="alert" className="text-body text-state-urgent">{error}</p> : null}
        <div className="flex gap-3">
          {index > 0 ? <Button variant="ghost" onClick={() => setStep(STEPS[index - 1]!)}>{t("report.back")}</Button> : null}
          {step === "review" ? (
            <Button variant="primary" className="flex-1" isLoading={isSubmitting} onClick={handleSubmit} disabled={!description.trim()}>
              {t("report.submit")}
            </Button>
          ) : (
            <Button variant="primary" className="flex-1" disabled={!canContinue} onClick={() => setStep(STEPS[index + 1]!)}>
              {t("report.continue")}
            </Button>
          )}
        </div>
      </ContextSurface>
    </div>
  );
}
