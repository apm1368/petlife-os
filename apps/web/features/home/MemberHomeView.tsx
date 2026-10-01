"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import type { PetOverviewDto } from "@petlife/types";
import { Avatar, CalendarDays, ChevronLeft, ChevronRight, HeartPulse, Images, ShoppingBag, Skeleton, StatusLabel, Stethoscope } from "@petlife/ui";
import { petsService } from "@/services/pets.service";
import { bookingsService } from "@/services/bookings.service";
import { useActivePet } from "@/hooks/use-active-pet";
import { useSessionStore } from "@/stores/session-store";
import { LoadFailure } from "@/features/system/LoadFailure";
import { formatAppointmentDateTime } from "@/lib/date/appointment-date";
import { formatAge, speciesLabel } from "@/features/pets/pet-identity";
import { attentionTitle, eventTitle, formatOverviewDate, severityBarClass, severityLabel, severityTone } from "@/features/pets/overview-labels";

type Booking = Awaited<ReturnType<typeof bookingsService.list>>[number];

const COPY = {
  fa: {
    hello: (name: string) => `سلام، ${name}`,
    todayIs: "امروز",
    addPet: "افزودن حیوان",
    profile: "پروفایل کامل",
    attention: "نیازمند توجه",
    noAttention: "بر اساس آنچه ثبت شده، کار فوری‌ای در انتظار نیست.",
    noAttentionHint: "این به معنی کامل بودن پرونده نیست؛ هرچه بیشتر ثبت کنید، یادآوری‌ها دقیق‌تر می‌شوند.",
    next: "نوبت بعدی",
    noNext: "نوبتی در پیش ندارید.",
    findVet: "یافتن دامپزشک",
    findService: "خدمات",
    details: "جزئیات نوبت",
    upcoming: "پیش‌رو",
    noUpcoming: "یادآور یا رویداد زمان‌داری ثبت نشده است.",
    calendar: "تقویم مراقبت",
    shortcuts: "میان‌برها",
    health: "پرونده سلامت",
    care: "مراقبت‌ها",
    memories: "خاطرات",
    shop: "فروشگاه",
    welcomeTitle: "به پت‌لایف خوش آمدید",
    welcomeBody: "با افزودن اولین حیوان، سلامت، مراقبت و خاطراتش را یک‌جا دنبال کنید.",
    welcomeCta: "افزودن اولین حیوان",
    unknownAge: "سن نامشخص",
    switchPet: "انتخاب حیوان",
  },
  en: {
    hello: (name: string) => `Hello, ${name}`,
    todayIs: "Today",
    addPet: "Add a pet",
    profile: "Full profile",
    attention: "Needs attention",
    noAttention: "Based on what's recorded, nothing urgent is waiting.",
    noAttentionHint: "That doesn't mean the record is complete — the more you add, the better the reminders.",
    next: "Next appointment",
    noNext: "You have no upcoming appointment.",
    findVet: "Find a vet",
    findService: "Services",
    details: "Appointment details",
    upcoming: "Coming up",
    noUpcoming: "No dated reminder or event is recorded.",
    calendar: "Care calendar",
    shortcuts: "Shortcuts",
    health: "Health record",
    care: "Care",
    memories: "Memories",
    shop: "Shop",
    welcomeTitle: "Welcome to PET LIFE",
    welcomeBody: "Add your first pet to keep their health, care and memories in one place.",
    welcomeCta: "Add your first pet",
    unknownAge: "Age unknown",
    switchPet: "Choose a pet",
  },
} as const;

/**
 * The member home: the approved dashboard's hierarchy (pet identity → what needs attention →
 * next appointment → what's coming → shortcuts), filled with the member's own data. Every block
 * has an honest empty state; nothing is invented.
 */
export function MemberHomeView() {
  const locale = useLocale() === "en" ? "en" : "fa";
  const c = COPY[locale];
  const Forward = locale === "fa" ? ChevronLeft : ChevronRight;
  const user = useSessionStore((s) => s.user);
  const { pets, activePetId, switchActivePet, isSwitching } = useActivePet();
  const [overview, setOverview] = useState<PetOverviewDto | null>(null);
  const [nextBooking, setNextBooking] = useState<Booking | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  // No active pet recorded yet (e.g. a household created before active-pet existed): use the first pet.
  const petId = activePetId ?? pets[0]?.id ?? null;

  async function load() {
    setError(null);
    if (!petId) return;
    try {
      const [ov, bookings] = await Promise.all([petsService.getOverview(petId), bookingsService.list({ upcoming: true }).catch(() => [] as Booking[])]);
      setOverview(ov);
      const sorted = [...bookings].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
      setNextBooking(sorted.find((b) => b.petId === petId) ?? sorted[0] ?? null);
    } catch (err) {
      setError(err);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId, isSwitching]);

  const firstName = (user?.displayName ?? "").split(" ")[0] ?? "";
  const today = new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en-US", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Tehran" }).format(new Date());

  if (!petId) {
    return (
      <div className="member-home">
        <section className="member-home__welcome">
          <h1>{c.welcomeTitle}</h1>
          <p>{c.welcomeBody}</p>
          <Link className="account-link-button" href={`/${locale}/onboarding`}>{c.welcomeCta}</Link>
        </section>
      </div>
    );
  }
  if (error) return <LoadFailure error={error} onRetry={load} />;
  if (!overview) return <Skeleton className="h-72 w-full" aria-label={locale === "fa" ? "در حال بارگذاری" : "Loading"} />;

  const pet = overview.pet;
  const petBase = `/${locale}/pets/${pet.id}`;
  return (
    <div className="member-home">
      <header className="member-home__greeting">
        <div>
          <p>{c.todayIs} · {today}</p>
          <h1>{firstName ? c.hello(firstName) : pet.name}</h1>
        </div>
        <Link href={`/${locale}/pets/new`} className="member-home__add">+ {c.addPet}</Link>
      </header>

      {pets.length > 1 ? (
        <nav className="member-home__pets" aria-label={c.switchPet}>
          {pets.map((p) => (
            <button key={p.id} type="button" aria-pressed={p.id === petId} onClick={() => void switchActivePet(p.id)}>
              <Avatar name={p.name} src={p.photoUrl ?? undefined} size="sm" />
              <span>{p.name}</span>
            </button>
          ))}
        </nav>
      ) : null}

      <section className="member-home__hero" aria-label={pet.name}>
        <Avatar name={pet.name} src={pet.photoUrl ?? undefined} size="lg" />
        <div className="member-home__hero-text">
          <h2>{pet.name}</h2>
          <p>{[speciesLabel(pet, locale), pet.breed, formatAge(pet, locale, c.unknownAge)].filter(Boolean).join(" · ")}</p>
        </div>
        <Link href={petBase} className="member-home__hero-link">
          {c.profile}
          <Forward size={16} aria-hidden="true" />
        </Link>
      </section>

      <div className="member-home__grid">
        <section className="member-home__card" aria-labelledby="home-attention">
          <h2 id="home-attention">{c.attention}</h2>
          {overview.attention.length === 0 ? (
            <div className="member-home__calm"><p>{c.noAttention}</p><p>{c.noAttentionHint}</p></div>
          ) : (
            <ul className="member-home__list">
              {overview.attention.slice(0, 4).map((item) => (
                <li key={item.id}>
                  <Link href={petBase + item.href}>
                    <span className={`member-home__bar ${severityBarClass(item.severity)}`} aria-hidden="true" />
                    <span className="member-home__item-text">
                      <strong>{attentionTitle(item.title, locale)}</strong>
                      {item.dueAt ? <span>{formatOverviewDate(item.dueAt, locale)}</span> : null}
                    </span>
                    {item.severity === "ATTENTION" ? null : <StatusLabel tone={severityTone(item.severity)}>{severityLabel(item.severity, locale)}</StatusLabel>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="member-home__card" aria-labelledby="home-next">
          <h2 id="home-next">{c.next}</h2>
          {nextBooking ? (
            <Link href={`/${locale}/bookings/${nextBooking.id}`} className="member-home__next">
              <span className="member-home__next-icon"><Stethoscope size={20} aria-hidden="true" /></span>
              <span className="member-home__item-text">
                <strong>{nextBooking.serviceName ?? nextBooking.provider?.name}</strong>
                {nextBooking.provider?.name ? <span>{nextBooking.provider.name}</span> : null}
                <span>{formatAppointmentDateTime(nextBooking.startAt, locale, nextBooking.location?.timezone ?? "Asia/Tehran")}</span>
              </span>
              <Forward size={18} aria-hidden="true" />
            </Link>
          ) : (
            <div className="member-home__calm">
              <p>{c.noNext}</p>
              <div className="member-home__actions">
                <Link href={`/${locale}/vet/find`} className="account-link-button">{c.findVet}</Link>
                <Link href={`/${locale}/services`} className="system-state__link">{c.findService}</Link>
              </div>
            </div>
          )}
        </section>

        <section className="member-home__card" aria-labelledby="home-upcoming">
          <div className="member-home__card-head">
            <h2 id="home-upcoming">{c.upcoming}</h2>
            <Link href={`/${locale}/care-calendar`}>{c.calendar}</Link>
          </div>
          {overview.upcoming.length === 0 ? (
            <p className="member-home__empty">{c.noUpcoming}</p>
          ) : (
            <ul className="member-home__list">
              {overview.upcoming.slice(0, 4).map((item) => (
                <li key={`${item.type}-${item.id}`}>
                  <Link href={item.href.startsWith("/bookings/") ? `/${locale}${item.href}` : petBase + item.href}>
                    <span className="member-home__item-text">
                      <strong>{eventTitle(item.title, locale)}</strong>
                      <span>{formatOverviewDate(item.occurredAt, locale)}{item.providerName ? ` · ${item.providerName}` : ""}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <nav className="member-home__card member-home__shortcuts" aria-label={c.shortcuts}>
          <h2>{c.shortcuts}</h2>
          <Link href={`${petBase}/health`}><HeartPulse size={18} aria-hidden="true" />{c.health}</Link>
          <Link href={`${petBase}/care`}><CalendarDays size={18} aria-hidden="true" />{c.care}</Link>
          <Link href={`${petBase}/memories`}><Images size={18} aria-hidden="true" />{c.memories}</Link>
          <Link href={`/${locale}/shop`}><ShoppingBag size={18} aria-hidden="true" />{c.shop}</Link>
        </nav>
      </div>
    </div>
  );
}
