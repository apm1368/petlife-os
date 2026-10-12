"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Avatar, Button, Skeleton } from "@petlife/ui";
import {
  AllergyStatus,
  ConditionStatus,
  MedicationStatus,
  type AllergyDto,
  type CareProfileDto,
  type ConditionDto,
  type MedicationDto,
  type PetAccessFlags,
  type PetDto,
} from "@petlife/types";
import { petsService } from "@/services/pets.service";
import { careProfileService } from "@/services/care-profile.service";
import { healthService } from "@/services/health.service";
import { careRemindersService, type CareReminder } from "@/services/care-reminders.service";
import { LoadFailure } from "@/features/system/LoadFailure";
import { careTitle } from "@/features/care/care-labels";
import { formatAge, formatWeight, speciesLabel } from "@/features/pets/pet-identity";
import { formatDay, todayIso } from "@/lib/date/jalali";

type Locale = "fa" | "en";
/** A section either loaded, was not permitted, or failed — the sheet still prints what it has. */
type Part<T> = { state: "ok"; value: T } | { state: "denied" } | { state: "failed" };

const UPCOMING_DAYS = 14;

const copy = {
  fa: {
    title: "برگه مراقبت",
    intro: "هر چه پرستار یا نگهدار موقت باید بداند، در یک صفحه. چاپ کنید یا به PDF ذخیره کنید و به او بدهید.",
    print: "چاپ / ذخیره PDF",
    printedOn: "تهیه‌شده در",
    routine: "روال روزانه",
    feeding: "غذا",
    toilet: "دستشویی",
    leash: "قلاده و پیاده‌روی",
    separation: "تنها ماندن",
    temperament: "خلق‌وخو",
    temperamentGeneral: "رفتار کلی",
    people: "با آدم‌ها",
    animals: "با حیوان‌های دیگر",
    handling: "حساسیت به لمس",
    instructions: "دستورهای ویژه",
    health: "نکات سلامت",
    allergies: "آلرژی‌های فعال",
    medications: "داروهای جاری",
    conditions: "بیماری‌های فعال",
    noneRecorded: "موردی ثبت نشده است.",
    notRecorded: "ثبت نشده",
    upcoming: "مراقبت‌های ۱۴ روز آینده",
    noUpcoming: "یادآوری در این بازه ثبت نشده است.",
    denied: "شما به این بخش دسترسی ندارید؛ در برگه نمی‌آید.",
    failed: "این بخش بارگذاری نشد؛ در برگه نمی‌آید.",
    stay: "برای این سپردن",
    stayHint: "این بخش ذخیره نمی‌شود و فقط روی برگه چاپ می‌شود.",
    emergencyName: "تماس اضطراری — نام",
    emergencyPhone: "تماس اضطراری — تلفن",
    stayNotes: "یادداشت برای پرستار",
    severity: { MILD: "خفیف", MODERATE: "متوسط", SEVERE: "شدید", UNKNOWN: "شدت نامشخص" },
    reaction: "واکنش",
    weight: "وزن",
    microchip: "میکروچیپ دارد",
    unknownBreed: "نژاد ثبت نشده",
    unknownAge: "سن ثبت نشده",
    loading: "در حال آماده‌سازی برگه",
    sourceNote: "اطلاعات سلامت از پرونده پت‌لایف است؛ نبودِ مورد یعنی ثبت نشده، نه تأیید نبودن.",
  },
  en: {
    title: "Care sheet",
    intro: "Everything a sitter needs to know, on one page. Print it or save it as a PDF and hand it over.",
    print: "Print / save as PDF",
    printedOn: "Prepared on",
    routine: "Daily routine",
    feeding: "Feeding",
    toilet: "Toilet",
    leash: "Leash & walks",
    separation: "Being alone",
    temperament: "Temperament",
    temperamentGeneral: "General",
    people: "Around people",
    animals: "Around other animals",
    handling: "Handling sensitivity",
    instructions: "Special instructions",
    health: "Health notes",
    allergies: "Active allergies",
    medications: "Current medications",
    conditions: "Active conditions",
    noneRecorded: "None recorded.",
    notRecorded: "Not recorded",
    upcoming: "Care in the next 14 days",
    noUpcoming: "No reminders in this period.",
    denied: "You don't have access to this section; it is left off the sheet.",
    failed: "This section didn't load; it is left off the sheet.",
    stay: "For this stay",
    stayHint: "Not saved — printed on the sheet only.",
    emergencyName: "Emergency contact — name",
    emergencyPhone: "Emergency contact — phone",
    stayNotes: "Notes for the sitter",
    severity: { MILD: "Mild", MODERATE: "Moderate", SEVERE: "Severe", UNKNOWN: "Severity unknown" },
    reaction: "Reaction",
    weight: "Weight",
    microchip: "Microchipped",
    unknownBreed: "Breed not recorded",
    unknownAge: "Age not recorded",
    loading: "Preparing the sheet",
    sourceNote: "Health details come from the PET LIFE record; nothing listed means nothing recorded, not confirmed absence.",
  },
} as const;

async function part<T>(allowed: boolean, load: () => Promise<T>): Promise<Part<T>> {
  if (!allowed) return { state: "denied" };
  try {
    return { state: "ok", value: await load() };
  } catch {
    return { state: "failed" };
  }
}

interface SheetData {
  pet: PetDto;
  access: PetAccessFlags;
  profile: Part<CareProfileDto>;
  health: Part<{ allergies: AllergyDto[]; medications: MedicationDto[]; conditions: ConditionDto[] }>;
  upcoming: Part<CareReminder[]>;
}

export function CareSheetView({ petId }: { petId: string }) {
  const locale = (useLocale() === "fa" ? "fa" : "en") as Locale;
  const c = copy[locale];
  const [data, setData] = useState<SheetData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [stayNotes, setStayNotes] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [pet, access] = await Promise.all([petsService.getById(petId), petsService.getMyAccess(petId)]);
      const horizon = Date.now() + UPCOMING_DAYS * 86_400_000;
      const [profile, health, upcoming] = await Promise.all([
        part(access.canViewCareProfile, () => careProfileService.get(petId)),
        part(access.canViewHealth, async () => {
          const [allergies, medications, conditions] = await Promise.all([healthService.listAllergies(petId), healthService.listMedications(petId), healthService.listConditions(petId)]);
          return {
            allergies: allergies.filter((a) => a.status === AllergyStatus.ACTIVE),
            medications: medications.filter((m) => m.status === MedicationStatus.ACTIVE || m.status === MedicationStatus.SCHEDULED),
            conditions: conditions.filter((x) => x.status === ConditionStatus.ACTIVE),
          };
        }),
        part(access.canViewCareProfile, async () =>
          (await careRemindersService.list(petId))
            .filter((r) => !["COMPLETED", "CANCELLED"].includes(r.state) && new Date(r.snoozedUntil ?? r.dueAt).getTime() <= horizon)
            .sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
        ),
      ]);
      setData({ pet, access, profile, health, upcoming });
    } catch (err) {
      setError(err);
    }
  }, [petId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <LoadFailure error={error} onRetry={load} />;
  if (!data) return <Skeleton className="h-96 w-full" aria-label={c.loading} />;

  const { pet, profile, health, upcoming } = data;
  const p = profile.state === "ok" ? profile.value : null;
  const field = (value: string | null | undefined) => value?.trim() || c.notRecorded;

  return (
    <div className="care-sheet flex flex-col gap-6">
      <style>{`@media print {
  body * { visibility: hidden !important; }
  .care-sheet, .care-sheet * { visibility: visible !important; }
  .care-sheet { position: absolute; inset: 0; padding: 12mm; background: #fff; color: #000; }
  .care-sheet .print-hide { display: none !important; }
  .care-sheet section { break-inside: avoid; }
}`}</style>

      <div className="print-hide flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-section-title text-text-primary">{c.title}</h1>
          <p className="mt-1 text-sm leading-7 text-text-secondary">{c.intro}</p>
        </div>
        <Button onClick={() => window.print()}>{c.print}</Button>
      </div>

      <header className="flex items-center gap-4 border-b border-border-subtle pb-4">
        <Avatar src={pet.photoUrl} name={pet.name} size="lg" />
        <div className="min-w-0">
          <p className="text-2xl font-bold text-text-primary">{pet.name}</p>
          <p className="text-sm text-text-secondary">
            {speciesLabel(pet, locale)} · {pet.breed ?? c.unknownBreed} · {formatAge(pet, locale, c.unknownAge)} · {c.weight}: {formatWeight(pet, locale, c.notRecorded)}
            {pet.microchipNumber ? <> · {c.microchip}</> : null}
          </p>
          <p className="text-xs text-text-secondary">{c.printedOn} {formatDay(todayIso(), locale)}</p>
        </div>
      </header>

      <Section title={c.routine} part={profile} c={c}>
        <Facts rows={[[c.feeding, field(p?.feedingRoutineText)], [c.toilet, field(p?.toiletRoutineText)], [c.leash, field(p?.leashBehaviorText)], [c.separation, field(p?.separationBehaviorText)]]} />
      </Section>

      <Section title={c.temperament} part={profile} c={c}>
        <Facts rows={[[c.temperamentGeneral, field(p?.temperamentText)], [c.people, field(p?.aroundPeopleText)], [c.animals, field(p?.aroundAnimalsText)], [c.handling, field(p?.handlingSensitivityText)]]} />
      </Section>

      {p?.specialInstructionsText ? (
        <section aria-labelledby="sheet-instructions" className="border-s-4 border-state-attention bg-state-attention/5 px-4 py-3">
          <h2 id="sheet-instructions" className="font-semibold text-text-primary">{c.instructions}</h2>
          <p className="mt-1 whitespace-pre-line text-sm leading-7 text-text-primary">{p.specialInstructionsText}</p>
        </section>
      ) : null}

      <Section title={c.health} part={health} c={c}>
        {health.state === "ok" ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <List title={c.allergies} empty={c.noneRecorded} items={health.value.allergies.map((a) => [a.name, [a.severity ? c.severity[a.severity] : null, a.reaction ? `${c.reaction}: ${a.reaction}` : null].filter(Boolean).join(" · ")])} />
            <List title={c.medications} empty={c.noneRecorded} items={health.value.medications.map((m) => [m.name, [m.dosage !== null ? `${Number(m.dosage).toLocaleString(locale === "fa" ? "fa-IR" : "en-US")}${m.unit ? " " + m.unit : ""}` : null, m.frequencyText, m.instructions].filter(Boolean).join(" · ")])} />
            <List title={c.conditions} empty={c.noneRecorded} items={health.value.conditions.map((x) => [x.name, x.notes ?? ""])} />
            <p className="text-xs text-text-secondary sm:col-span-3">{c.sourceNote}</p>
          </div>
        ) : null}
      </Section>

      <Section title={c.upcoming} part={upcoming} c={c}>
        {upcoming.state === "ok" ? (
          upcoming.value.length === 0 ? (
            <p className="text-sm text-text-secondary">{c.noUpcoming}</p>
          ) : (
            <ul className="divide-y divide-border-subtle text-sm">
              {upcoming.value.map((r) => (
                <li key={r.id} className="flex justify-between gap-3 py-2">
                  <span className="text-text-primary">{careTitle(r, locale)}</span>
                  <span className="text-text-secondary">{formatDay(new Date(r.snoozedUntil ?? r.dueAt).toISOString().slice(0, 10), locale, { weekday: true })}</span>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </Section>

      <section aria-labelledby="sheet-stay" className="split-panel">
        <h2 id="sheet-stay" className="font-semibold text-text-primary">{c.stay}</h2>
        <p className="print-hide mb-3 text-xs text-text-secondary">{c.stayHint}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-text-secondary">
            {c.emergencyName}
            <input className="mt-1 block w-full rounded border border-border-subtle bg-transparent p-2 text-text-primary" value={emergencyName} maxLength={80} onChange={(e) => setEmergencyName(e.target.value)} />
          </label>
          <label className="text-sm text-text-secondary">
            {c.emergencyPhone}
            <input className="mt-1 block w-full rounded border border-border-subtle bg-transparent p-2 text-text-primary" dir="ltr" inputMode="tel" value={emergencyPhone} maxLength={20} onChange={(e) => setEmergencyPhone(e.target.value)} />
          </label>
          <label className="text-sm text-text-secondary sm:col-span-2">
            {c.stayNotes}
            <textarea className="mt-1 block min-h-24 w-full rounded border border-border-subtle bg-transparent p-2 text-text-primary" value={stayNotes} maxLength={1000} onChange={(e) => setStayNotes(e.target.value)} />
          </label>
        </div>
      </section>
    </div>
  );
}

function Section<T>({ title, part, c, children }: { title: string; part: Part<T>; c: (typeof copy)[Locale]; children: React.ReactNode }) {
  // A section the reader may not see, or that failed, is explained on screen and left off the printed sheet.
  if (part.state !== "ok") {
    return (
      <section className="print-hide text-sm text-text-secondary" aria-label={title}>
        <h2 className="font-semibold text-text-primary">{title}</h2>
        <p>{part.state === "denied" ? c.denied : c.failed}</p>
      </section>
    );
  }
  return (
    <section aria-label={title}>
      <h2 className="mb-2 font-semibold text-text-primary">{title}</h2>
      {children}
    </section>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-text-secondary">{label}</dt>
          <dd className="whitespace-pre-line text-text-primary">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function List({ title, empty, items }: { title: string; empty: string; items: [string, string][] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-text-secondary">{empty}</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          {items.map(([name, detail], i) => (
            <li key={name + i}>
              <span className="font-medium text-text-primary">{name}</span>
              {detail ? <span className="text-text-secondary"> — {detail}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
