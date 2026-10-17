"use client";

import Link from "@/features/navigation/localized-link";
import type { PetDto, PetOverviewDto } from "@petlife/types";
import { Avatar, Bell, CalendarDays, HeartPulse, Images, Plus, Syringe, Weight } from "@petlife/ui";
import type { CareReminder } from "@/services/care-reminders.service";
import { formatAge, formatWeight, speciesLabel } from "@/features/pets/pet-identity";

type Locale = "fa" | "en";
const num = (n: number, locale: Locale) => n.toLocaleString(locale === "fa" ? "fa-IR" : "en-US");
const DAY = 86_400_000;

/** Profile completeness from the pet's own recorded fields — each one is something the owner can add. */
export function profileCompleteness(pet: PetDto): number {
  const checks = [!!pet.photoUrl, !!pet.breed, !!(pet.birthDate || pet.approximateAgeMonths), pet.latestWeightValue != null, !!pet.microchipNumber, !!pet.sex && pet.sex !== "UNKNOWN", !!pet.colorMarkings];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

/** Care rhythm: how many care items were completed on each of the last 30 days (real completions only). */
function rhythm(care: CareReminder[]) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const bins = Array.from({ length: 30 }, () => 0);
  for (const c of care) {
    if (!c.completedAt) continue;
    const d = Math.floor((today.getTime() - new Date(c.completedAt).setHours(0, 0, 0, 0)) / DAY);
    if (d >= 0 && d < 30) bins[29 - d]! += 1;
  }
  return bins;
}

function Gauge({ value, label, tone, dashed = false }: { value: number; label: string; tone: "light" | "amber"; dashed?: boolean }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <div className="ih-gauge" data-tone={tone}>
      <svg viewBox="0 0 132 132" aria-hidden="true">
        <circle cx="66" cy="66" r={r} className="ih-gauge__track" strokeDasharray={dashed ? "2 4" : undefined} />
        <circle cx="66" cy="66" r={r} className="ih-gauge__value" strokeDasharray={`${(c * value) / 100} ${c}`} transform="rotate(-90 66 66)" />
      </svg>
      <span className="ih-gauge__label">{label}</span>
      <span className="ih-gauge__num">{value.toLocaleString(undefined)}٪</span>
    </div>
  );
}

export function ImmersiveHome({ locale, userName, pet, overview, care, pets, activePetId, onSwitch }: {
  locale: Locale; userName: string | null; pet: PetDto; overview: PetOverviewDto; care: CareReminder[];
  pets: PetDto[]; activePetId: string | null; onSwitch: (id: string) => void;
}) {
  const fa = locale === "fa";
  const base = `/pets/${pet.id}`;
  const bins = rhythm(care);
  const done30 = bins.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...bins);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const dueThisMonth = care.filter((c) => !c.cancelledAt && new Date(c.dueAt) >= monthStart && new Date(c.dueAt) < new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1));
  const doneThisMonth = dueThisMonth.filter((c) => c.completedAt).length;
  const carePct = dueThisMonth.length ? Math.round((doneThisMonth / dueThisMonth.length) * 100) : 0;
  const completeness = profileCompleteness(pet);
  const vaccine = care.filter((c) => c.type === "VACCINATION" && !c.completedAt && !c.cancelledAt).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  const vaccineDays = vaccine ? Math.max(0, Math.ceil((Date.parse(vaccine.dueAt) - Date.now()) / DAY)) : null;
  const vaccinePct = vaccineDays === null ? null : Math.max(4, Math.min(100, 100 - Math.round((vaccineDays / 365) * 100)));
  const today = new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date());
  const upcoming = overview.upcoming.length;

  return (
    <section className="ih" aria-label={fa ? `داشبورد ${pet.name}` : `${pet.name} dashboard`}>
      <DashboardBackdrop />
      <div className="ih__top">
        <nav className="ih-pill ih-tabs" aria-label={fa ? "بخش‌های حیوان" : "Pet sections"}>
          <Link href={base} aria-current="page">{fa ? "نمای کلی" : "Overview"}</Link>
          <Link href={`${base}/health`}>{fa ? "سلامت" : "Health"}</Link>
          <Link href={`${base}/care`}>{fa ? "مراقبت" : "Care"}</Link>
          <Link href={`${base}/memories`}>{fa ? "خاطرات" : "Memories"}</Link>
          <Link href={`${base}/health/documents`}>{fa ? "اسناد" : "Documents"}</Link>
          <Link href={`${base}/travel`}>{fa ? "سفر" : "Travel"}</Link>
        </nav>
      </div>

      <div className="ih__grid">
        <div className="ih__col">
          <div className="ih-chips">
            <span className="ih-chip ih-chip--round" aria-hidden="true"><HeartPulse size={18} /></span>
            <span className="ih-chip"><CalendarDays size={16} aria-hidden="true" />{today}</span>
          </div>
          <Link href={`${base}/care`} className="ih-glass ih-card">
            <span className="ih-card__head"><span className="ih-ico"><HeartPulse size={15} aria-hidden="true" /></span>{fa ? "ریتم مراقبت" : "Care rhythm"}</span>
            <span className="ih-bars" aria-hidden="true">
              {bins.map((v, i) => <span key={i} style={{ height: `${14 + (v / max) * 86}%` }} data-on={v > 0 || undefined} />)}
            </span>
            <span className="ih-card__metric"><b>{num(done30, locale)}</b><small>{fa ? "کار انجام‌شده در ۳۰ روز اخیر" : "care tasks done, last 30 days"}</small></span>
          </Link>
          <div className="ih-gauges">
            <Gauge value={completeness} label={fa ? "کامل بودن پروفایل" : "Profile"} tone="light" dashed />
            <Gauge value={carePct} label={fa ? "مراقبت این ماه" : "Care this month"} tone="amber" />
          </div>
          <Link href={`${base}/health/vaccination`} className="ih-glass ih-card">
            <span className="ih-card__head"><span className="ih-ico"><Syringe size={15} aria-hidden="true" /></span>{fa ? "واکسن بعدی" : "Next vaccine"}</span>
            {vaccinePct === null ? (
              <span className="ih-card__note">{fa ? "واکسنی در برنامه ثبت نشده است." : "No vaccine scheduled."}</span>
            ) : (
              <>
                <span className="ih-meter__scale"><span>{fa ? "امروز" : "Today"}</span><span className="ih-meter__tip">{fa ? `${num(vaccineDays!, locale)} روز دیگر` : `in ${vaccineDays} days`}</span><span>{fa ? "یک سال" : "1 year"}</span></span>
                <span className="ih-meter" aria-hidden="true"><span style={{ width: `${vaccinePct}%` }} /></span>
              </>
            )}
          </Link>
        </div>

        <div className="ih__center">
          <span className="ih-lens"><Avatar name={pet.name} src={pet.photoUrl ?? undefined} size="lg" className="ih-lens__photo" /></span>
          <span className="ih-label"><span className="ih-label__dot" aria-hidden="true" />{fa ? `شناسنامه‌ی ${pet.name}` : `${pet.name}'s identity`}{pet.microchipNumber ? <small dir="ltr">· {pet.microchipNumber.slice(0, 3)}…{pet.microchipNumber.slice(-4)}</small> : null}</span>
          <Link href="/pets/new" className="ih-pill ih-add"><Plus size={18} aria-hidden="true" />{fa ? "افزودن حیوان" : "Add a pet"}</Link>
        </div>

        <div className="ih__col ih__col--end">
          <Link href={base} className="ih-glass ih-pet">
            <span className="ih-pet__kicker ih-pet__kicker--top"><HeartPulse size={14} aria-hidden="true" />{fa ? "کارت سلامت" : "Health card"}</span>
            <span className="ih-pet__kicker">{fa ? `سلام ${userName ?? ""}`.trim() : `Hi ${userName ?? ""}`.trim()} · {[speciesLabel(pet, locale), pet.breed].filter(Boolean).join(" · ")}</span>
            <h2 className="ih-pet__name">{pet.name}</h2>
            <span className="ih-pet__big"><b>{num(upcoming, locale)}</b><small>{fa ? "کار پیش‌رو" : "coming up"}</small></span>
            <span className="ih-pet__stats">
              <span><Weight size={16} aria-hidden="true" /><b>{formatWeight(pet, locale, "—")}</b><small>{fa ? "وزن" : "weight"}</small></span>
              <span><CalendarDays size={16} aria-hidden="true" /><b>{formatAge(pet, locale, "—")}</b><small>{fa ? "سن" : "age"}</small></span>
              <span><Bell size={16} aria-hidden="true" /><b>{num(overview.attention.length, locale)}</b><small>{fa ? "نیاز به توجه" : "attention"}</small></span>
            </span>
          </Link>
          <div className="ih-orbs">
            <Link href={`${base}/health`} className="ih-orb" aria-label={fa ? "سلامت" : "Health"}><HeartPulse size={20} aria-hidden="true" /></Link>
            <Link href={`${base}/care`} className="ih-orb" aria-label={fa ? "مراقبت" : "Care"}><CalendarDays size={20} aria-hidden="true" /></Link>
            <Link href={`${base}/memories`} className="ih-orb" aria-label={fa ? "خاطرات" : "Memories"}><Images size={20} aria-hidden="true" /></Link>
          </div>
        </div>
      </div>

      {pets.length > 1 ? (
        <div className="ih__bottom">
          <div className="ih-pill ih-switch" role="group" aria-label={fa ? "انتخاب حیوان" : "Choose pet"}>
            {pets.map((p) => (
              <button key={p.id} type="button" aria-pressed={p.id === activePetId} onClick={() => onSwitch(p.id)}>
                <Avatar name={p.name} src={p.photoUrl ?? undefined} size="sm" /><span>{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** Real photo backdrop — Damavand from Tochal (Alireza Javaheri, CC BY 3.0, see /credits), warmed into a blue-hour glow. */
function DashboardBackdrop() {
  return (
    <div className="ih__backdrop" aria-hidden="true">
      <div className="ih__photo" />
      <div className="ih__glow" />
      {[[3, 86, 80], [70, 52, 104], [91, 74, 84], [18, 34, 44], [60, 20, 32], [84, 33, 40], [52, 90, 50]].map(([x, y, d], i) => (
        <span key={i} className={i % 2 ? "ih-bubble ih-bob ih-bob--late" : "ih-bubble ih-bob"} style={{ left: `${x}%`, top: `${y}%`, width: d, height: d }} />
      ))}
    </div>
  );
}
