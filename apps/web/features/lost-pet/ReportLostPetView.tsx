"use client";

import { useState } from "react";
import { useLocalizedRouter as useRouter } from "@/features/navigation/localized-link";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface } from "@petlife/ui";
import { lostPetService } from "@/services/lost-pet.service";
import { DateRangeField } from "@/features/shared/date-picker/DateRangePicker";
import { addDays, formatDay, todayIso } from "@/lib/date/jalali";
import { apiErrorText } from "@/lib/errors/api-error-text";
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
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";
  const router = useRouter();

  const [step, setStep] = useState<Step>("where");
  const [publicArea, setPublicArea] = useState("");
  const [lastKnownLocation, setLastKnownLocation] = useState("");
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
        lastSeenAt: seenDay ? toInstant(seenDay, seenTime) : undefined,
        publicNotes: publicNotes.trim() || undefined,
        privateNotes: privateNotes.trim() || undefined,
        contactPreference,
        publicContactMode: contactPreference === "PUBLIC_CONTACT" ? publicContactMode.trim() : undefined,
        primaryPhotoObjectKey,
      });
      router.push(`/pets/${petId}/lost/${incident.id}`);
    } catch (err) {
      setError(apiErrorText(err, lang, tCommon("genericError")));
    } finally {
      setIsSubmitting(false);
    }
  }

  const PublicTag = () => <span className="ms-2 rounded-full bg-state-attention/10 px-2 py-0.5 text-metadata text-state-attention">{fa ? "عمومی" : "Public"}</span>;
  const PrivateTag = () => <span className="ms-2 rounded-full bg-surface-subtle px-2 py-0.5 text-metadata text-text-secondary">{fa ? "خصوصی" : "Private"}</span>;
  const stepLabel: Record<Step, [string, string]> = { where: ["کجا و کی", "Where & when"], photo: ["عکس", "Photo"], describe: ["توضیحات", "Description"], contact: ["تماس", "Contact"], review: ["بازبینی", "Review"] };

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("report.title")}</h1>
      <p className="text-body text-text-secondary">{t("report.subtitle")}</p>
      <ol className="flex gap-2 overflow-x-auto text-metadata" aria-label={fa ? "مراحل" : "Steps"}>
        {STEPS.map((s, i) => (
          <li key={s} aria-current={s === step ? "step" : undefined} className={`shrink-0 rounded-full px-3 py-1 ${s === step ? "bg-brand-solid text-on-brand" : i < index ? "bg-surface-subtle text-text-primary" : "text-text-secondary"}`}>
            {i < index ? "✓ " : ""}
            {stepLabel[s][fa ? 0 : 1]}
          </li>
        ))}
      </ol>

      <ContextSurface className="flex flex-col gap-4">
        {step === "where" ? (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-text-primary">{fa ? "محدودهٔ تقریبی" : "Approximate area"}<PublicTag /></span>
              <input dir="auto" maxLength={120} value={publicArea} onChange={(e) => setPublicArea(e.target.value)} placeholder={fa ? "مثلاً یوسف‌آباد، نزدیک پارک شفق" : "e.g. Yousefabad, near Shafagh park"} className="min-h-12 rounded-md border border-border-subtle bg-surface-base px-3" />
              <span className="text-metadata text-text-secondary">{fa ? "فقط محله یا خیابان اصلی — نشانی خانه ننویسید. این متن در صفحهٔ عمومی دیده می‌شود." : "Neighbourhood or main street only — never a home address. This is shown on the public page."}</span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-text-primary">{fa ? "مکان دقیق آخرین مشاهده" : "Exact last-seen place"}<PrivateTag /></span>
              <input dir="auto" maxLength={300} value={lastKnownLocation} onChange={(e) => setLastKnownLocation(e.target.value)} className="min-h-12 rounded-md border border-border-subtle bg-surface-base px-3" />
              <span className="text-metadata text-text-secondary">{fa ? "فقط برای شما و اعضای خانواده (و در صورت نیاز تیم پشتیبانی)." : "Only for you and your household (and support staff if needed)."}</span>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <DateRangeField mode="single" label={fa ? "تاریخ آخرین مشاهده" : "Date last seen"} value={{ start: seenDay, end: null }} onChange={(v) => setSeenDay(v.start)} min={addDays(todayIso(), -60)} max={todayIso()} />
              <TimeSelect label={fa ? "ساعت تقریبی" : "Approximate time"} value={seenTime} onChange={setSeenTime} />
            </div>
          </>
        ) : null}

        {step === "photo" ? (
          <div className="flex flex-col gap-2">
            <FilePicker label={<>{t("report.photoLabel")}<PublicTag /></>} aria-label={t("report.photoLabel")} accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            <p className="text-metadata text-text-secondary">{fa ? "عکسی واضح که صورت و علامت‌های خاص را نشان دهد. بدون چهرهٔ افراد یا پلاک خانه." : "A clear photo showing the face and distinctive markings — no people's faces or house numbers."}</p>
          </div>
        ) : null}

        {step === "describe" ? (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-text-primary">{t("report.descriptionLabel")}<PublicTag /></span>
              <textarea dir="auto" maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("report.descriptionPlaceholder")} className="min-h-24 rounded-md border border-border-subtle bg-surface-base p-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-text-primary">{fa ? "نکته برای کسی که او را می‌بیند" : "Note for someone who spots them"}<PublicTag /></span>
              <textarea dir="auto" maxLength={2000} value={publicNotes} onChange={(e) => setPublicNotes(e.target.value)} placeholder={fa ? "مثلاً ترسوست؛ دنبالش نکنید، فقط گزارش دهید." : "e.g. Shy — please don't chase, just report."} className="min-h-20 rounded-md border border-border-subtle bg-surface-base p-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-text-primary">{fa ? "یادداشت خصوصی" : "Private notes"}<PrivateTag /></span>
              <textarea dir="auto" maxLength={2000} value={privateNotes} onChange={(e) => setPrivateNotes(e.target.value)} placeholder={fa ? "مثلاً شمارهٔ میکروچیپ" : "e.g. microchip number"} className="min-h-16 rounded-md border border-border-subtle bg-surface-base p-2" />
            </label>
          </>
        ) : null}

        {step === "contact" ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-medium text-text-primary">{t("report.contactPreferenceLabel")}</legend>
            {([
              ["IN_APP_MESSAGE", t("report.contactPreference.inAppMessage"), fa ? "پیشنهادی: گزارش‌ها از طریق PET LIFE به شما می‌رسد و اطلاعات تماس شما دیده نمی‌شود." : "Recommended: reports reach you through PET LIFE; your contact details stay hidden."],
              ["MASKED_CONTACT", t("report.contactPreference.maskedContact"), fa ? "گزارش‌دهنده از طریق PET LIFE با شما در ارتباط است؛ شماره نمایش داده نمی‌شود." : "Reporters reach you through PET LIFE; no number is shown."],
              ["PUBLIC_CONTACT", t("report.contactPreference.publicContact"), fa ? "یک خط تماس که خودتان می‌نویسید در صفحهٔ عمومی دیده می‌شود." : "A contact line you write yourself is shown on the public page."],
            ] as [Contact, string, string][]).map(([value, label, hint]) => (
              <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm ${contactPreference === value ? "border-brand-natural" : "border-border-subtle"}`}>
                <input type="radio" name="contact" className="mt-1 h-5 w-5" checked={contactPreference === value} onChange={() => setContactPreference(value)} />
                <span className="flex flex-col"><span className="font-medium">{label}</span><span className="text-text-secondary">{hint}</span></span>
              </label>
            ))}
            {contactPreference === "PUBLIC_CONTACT" ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{fa ? "خط تماس عمومی" : "Public contact line"}<PublicTag /></span>
                <input dir="auto" maxLength={120} value={publicContactMode} onChange={(e) => setPublicContactMode(e.target.value)} placeholder={fa ? "مثلاً ۰۹۱۲***۴۵۶۷ — فقط پیامک" : "e.g. 0912***4567 — text only"} className="min-h-12 rounded-md border border-border-subtle bg-surface-base px-3" />
                <span className="text-metadata text-state-attention">{fa ? "هر کسی این متن را می‌بیند. در صورت امکان شماره را کامل ننویسید." : "Anyone can see this. Avoid writing a full number if you can."}</span>
              </label>
            ) : null}
          </fieldset>
        ) : null}

        {step === "review" ? (
          <div className="flex flex-col gap-3 text-sm">
            <h2 className="font-bold">{fa ? "آنچه در صفحهٔ عمومی دیده می‌شود" : "What the public page shows"}</h2>
            <dl className="grid gap-1">
              <div><dt className="inline text-text-secondary">{fa ? "محدوده: " : "Area: "}</dt><dd className="inline">{publicArea.trim() || (fa ? "اعلام نشده" : "Not given")}</dd></div>
              <div><dt className="inline text-text-secondary">{fa ? "زمان: " : "When: "}</dt><dd className="inline">{seenDay ? `${formatDay(seenDay, lang)}${seenTime ? ` ${seenTime}` : ""}` : "—"}</dd></div>
              <div><dt className="inline text-text-secondary">{fa ? "عکس: " : "Photo: "}</dt><dd className="inline">{photo?.name ?? (fa ? "ندارد" : "None")}</dd></div>
              <div><dt className="inline text-text-secondary">{fa ? "توضیحات: " : "Description: "}</dt><dd className="inline">{description}</dd></div>
              {publicNotes.trim() ? <div><dt className="inline text-text-secondary">{fa ? "نکته: " : "Note: "}</dt><dd className="inline">{publicNotes}</dd></div> : null}
              <div><dt className="inline text-text-secondary">{fa ? "تماس: " : "Contact: "}</dt><dd className="inline">{contactPreference === "PUBLIC_CONTACT" ? publicContactMode : fa ? "از طریق PET LIFE" : "Through PET LIFE"}</dd></div>
            </dl>
            <p className="rounded-md bg-surface-subtle p-3 text-text-secondary">{fa ? "مکان دقیق، یادداشت خصوصی، اعضای خانواده، پروندهٔ سلامت و اطلاعات تماس شما عمومی نمی‌شوند." : "The exact place, private notes, household members, health record and your contact details are never made public."}</p>
          </div>
        ) : null}

        {error ? <p role="alert" className="text-body text-state-urgent">{error}</p> : null}
        <div className="flex gap-3">
          {index > 0 ? <Button variant="ghost" onClick={() => setStep(STEPS[index - 1]!)}>{fa ? "قبلی" : "Back"}</Button> : null}
          {step === "review" ? (
            <Button variant="primary" className="flex-1" isLoading={isSubmitting} onClick={handleSubmit} disabled={!description.trim()}>
              {t("report.submit")}
            </Button>
          ) : (
            <Button variant="primary" className="flex-1" disabled={!canContinue} onClick={() => setStep(STEPS[index + 1]!)}>
              {fa ? "ادامه" : "Continue"}
            </Button>
          )}
        </div>
      </ContextSurface>
    </div>
  );
}
