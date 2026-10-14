"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import type { OrderSummaryDto, PetOverviewDto, SubscriptionDto, TravelBookingDto } from "@petlife/types";
import { Avatar, CalendarDays, ChevronLeft, ChevronRight, HeartPulse, Images, MapPin, PackageCheck, Plane, Plus, Scissors, ShoppingBag, Skeleton, Sparkles, StatusLabel, Stethoscope, Users } from "@petlife/ui";
import { petsService } from "@/services/pets.service";
import { bookingsService } from "@/services/bookings.service";
import { careRemindersService } from "@/services/care-reminders.service";
import { careTitle } from "@/features/care/care-labels";
import { GlassMemberHome } from "./GlassMemberHome";
import { commerceService } from "@/services/commerce.service";
import { travelMarketService } from "@/services/travel-marketplace.service";
import { subscriptionService } from "@/services/subscription.service";
import { usePetStore } from "@/stores/pet-store";
import { statusLabel } from "@/lib/status/status-labels";
import { formatCurrency } from "@/lib/currency/format-currency";
import { formatDay } from "@/lib/date/jalali";
import { usePetAccess } from "@/hooks/use-pet-access";
import { useActivePet } from "@/hooks/use-active-pet";
import { useSessionStore } from "@/stores/session-store";
import { LoadFailure } from "@/features/system/LoadFailure";
import { formatAppointmentDateTime } from "@/lib/date/appointment-date";

import { eventTitle, eventSourceLabel, formatOverviewDate, mergeCareIntoOverview } from "@/features/pets/overview-labels";
import "./member-home.css";

type Booking = Awaited<ReturnType<typeof bookingsService.list>>[number];

const COPY = {
  fa: {
    dashboard: "داشبورد",
    startHere: "از اینجا شروع کنید",
    firstStep: "اولین قدم، آشنایی با حیوان شماست.",
    healthIntro: "پرونده، سوابق و مدارک سلامت در کنار هم.",
    careIntro: "نوبت‌ها و مراقبت‌های پیش‌رو، در زمان مناسب.",
    memoriesIntro: "جایی برای لحظه‌هایی که می‌خواهید نگه دارید.",
    account: "حساب شما",
    accountIntro: "اطلاعات شخصی و خانواده را از همین‌جا مدیریت کنید.",
    personal: "اطلاعات شخصی",
    household: "خانواده و دسترسی‌ها",
    recentActivity: "تازه‌های پرونده",
    noActivity: "با ثبت مراقبت، مراجعه یا خاطره، تاریخچهٔ حیوانتان اینجا شکل می‌گیرد.",
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
    sections: "بخش‌های پروفایل",
    lastHealth: "آخرین ثبت سلامت",
    documents: "اسناد",
    travel: "سفر",
    weight: "وزن",
    microchip: "میکروچیپ",
    registered: "ثبت شده",
    notRecorded: "ثبت نشده",
    recentHealth: "سوابق اخیر سلامت",
    noRecentHealth: "هنوز سابقه‌ای ثبت نشده است.",
    allHealth: "همهٔ پرونده",
    membership: "اشتراک",
    noMembership: "اشتراکی فعال نیست. مزایا و پلن‌ها را ببینید.",
    seePlans: "مشاهدهٔ پلن‌ها",
    manage: "مدیریت",
    trialUntil: "دورهٔ آزمایشی تا",
    renewsOn: "تمدید در",
    orders: "سفارش‌ها",
    noOrders: "هنوز سفارشی ثبت نکرده‌اید.",
    allOrders: "همهٔ سفارش‌ها",
    trips: "سفرهای پیش‌رو",
    noTrips: "رزرو اقامتی در پیش ندارید.",
    findStay: "یافتن اقامتگاه",
    explore: "برای حیوانتان",
    services: "خدمات",
    vets: "دامپزشک",
    shopLink: "فروشگاه",
    stays: "سفر و اقامت",
    community: "جامعه",
    unavailable: "این بخش الان بارگیری نشد.",
    retry: "تلاش دوباره",
  },
  en: {
    dashboard: "Dashboard",
    startHere: "Start here",
    firstStep: "First, let's get to know your pet.",
    healthIntro: "Health records, history and documents, together.",
    careIntro: "Appointments and upcoming care, at the right time.",
    memoriesIntro: "A place for the moments you want to keep.",
    account: "Your account",
    accountIntro: "Manage your personal details and household from here.",
    personal: "Personal details",
    household: "Household and access",
    recentActivity: "Latest in their record",
    noActivity: "Care, visits and memories will build your pet's history here.",
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
    sections: "Profile sections",
    lastHealth: "Last health entry",
    documents: "Documents",
    travel: "Travel",
    weight: "Weight",
    microchip: "Microchip",
    registered: "Registered",
    notRecorded: "Not recorded",
    recentHealth: "Recent health",
    noRecentHealth: "Nothing recorded yet.",
    allHealth: "Full record",
    membership: "Membership",
    noMembership: "No active membership. See the plans and what they include.",
    seePlans: "See plans",
    manage: "Manage",
    trialUntil: "Trial until",
    renewsOn: "Renews on",
    orders: "Orders",
    noOrders: "You haven't ordered anything yet.",
    allOrders: "All orders",
    trips: "Upcoming stays",
    noTrips: "No upcoming stay booked.",
    findStay: "Find a stay",
    explore: "For your pet",
    services: "Services",
    vets: "Vets",
    shopLink: "Shop",
    stays: "Travel and stays",
    community: "Community",
    unavailable: "This section could not load right now.",
    retry: "Retry",
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
  const [nextBooking, setNextBooking] = useState<Booking | "failed" | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [switchError, setSwitchError] = useState(false);
  const [careFailed, setCareFailed] = useState(false);
  const loadId = useRef(0);
  // Side panels load on their own: one failing never blanks the dashboard ("failed" shows an inline note).
  const [orders, setOrders] = useState<OrderSummaryDto[] | "failed" | null>(null);
  const [trips, setTrips] = useState<TravelBookingDto[] | "failed" | null>(null);
  const [membership, setMembership] = useState<SubscriptionDto | "none" | "failed" | null>(null);
  const householdId = usePetStore((s) => s.householdId);
  // No active pet recorded yet (e.g. a household created before active-pet existed): use the first pet.
  const petId = activePetId ?? pets[0]?.id ?? null;
  const permission = usePetAccess(petId);

  async function load() {
    const requestId = ++loadId.current;
    setError(null);
    setOverview(null);
    setNextBooking(undefined);
    if (!petId) return;
    try {
      const [ov, bookings, care] = await Promise.all([
        petsService.getOverview(petId),
        bookingsService.list({ upcoming: true }).catch(() => null),
        // The owner's care reminders count toward attention/upcoming exactly as on the pet profile.
        careRemindersService.list(petId).catch(() => null),
      ]);
      if (requestId !== loadId.current) return;
      setCareFailed(care === null);
      setOverview({ ...ov, ...mergeCareIntoOverview(ov, care ?? [], (item) => careTitle(item, locale)) });
      const sorted = [...(bookings ?? [])].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
      setNextBooking(bookings === null ? "failed" : sorted.find((b) => b.petId === petId) ?? sorted[0] ?? null);
    } catch (err) {
      if (requestId === loadId.current) setError(err);
    }
  }

  useEffect(() => {
    void load();
    return () => { loadId.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId, isSwitching]);

  useEffect(() => {
    void commerceService.listOrders().then(setOrders).catch(() => setOrders("failed"));
    void travelMarketService.listBookings({ scope: "upcoming" }).then((p) => setTrips(p.items)).catch(() => setTrips("failed"));
  }, []);
  useEffect(() => {
    if (!householdId) return;
    void subscriptionService
      .getCurrent(householdId)
      .then((sub) => setMembership(sub && ["ACTIVE", "TRIALING", "PAST_DUE", "GRACE_PERIOD", "CANCEL_AT_PERIOD_END"].includes(sub.status) ? sub : "none"))
      .catch((e: { status?: number }) => setMembership(e?.status === 404 ? "none" : "failed"));
  }, [householdId]);

  const firstName = (user?.displayName ?? "").split(" ")[0] ?? "";
  const today = new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en-US", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Tehran" }).format(new Date());

  if (!petId) {
    return (
      <div className="member-home member-home--new">
        <header className="member-home__greeting">
          <div>
            <p>{c.dashboard} <span aria-hidden="true"> / </span> {today}</p>
            <h1>{firstName ? c.hello(firstName) : c.welcomeTitle}</h1>
          </div>
        </header>
        <div className="member-home__welcome-layout">
          <section className="member-home__welcome" aria-labelledby="home-welcome">
            <span className="member-home__eyebrow">{c.startHere}</span>
            <h2 id="home-welcome">{c.firstStep}</h2>
            <p>{c.welcomeBody}</p>
            <Link className="member-home__primary" href={`/${locale}/onboarding`}><Plus size={18} aria-hidden="true" />{c.welcomeCta}</Link>
            <div className="member-home__welcome-details">
              {[
                { Icon: HeartPulse, title: c.health, description: c.healthIntro },
                { Icon: CalendarDays, title: c.care, description: c.careIntro },
                { Icon: Images, title: c.memories, description: c.memoriesIntro },
              ].map(({ Icon, title, description }) => (
                <div key={title}><Icon size={20} aria-hidden="true" /><div><h3>{title}</h3><p>{description}</p></div></div>
              ))}
            </div>
          </section>
          <aside className="member-home__welcome-account" aria-labelledby="home-account">
            <span className="member-home__account-avatar"><Avatar name={user?.displayName ?? c.account} size="lg" /></span>
            <h2 id="home-account">{c.account}</h2>
            <p>{c.accountIntro}</p>
            <nav aria-label={c.account}>
              {[["/profile", c.personal], ["/profile/household", c.household], ["/subscription", c.membership]].map(([href, label]) => (
                <Link key={href} href={`/${locale}${href}`}><span>{label}</span><Forward size={16} aria-hidden="true" /></Link>
              ))}
            </nav>
          </aside>
        </div>
        <DashboardExplore locale={locale} />
      </div>
    );
  }
  if (error) return <LoadFailure error={error} onRetry={load} />;
  if (!overview) return <Skeleton className="h-72 w-full" aria-label={locale === "fa" ? "در حال بارگذاری" : "Loading"} />;

  const pet = overview.pet;
  const petBase = `/${locale}/pets/${pet.id}`;
  const shownHealth = new Set(overview.recentHealth.slice(0, 4).map((item) => `${item.type}-${item.id}`));
  const activity = overview.recentActivity.filter((item) => !shownHealth.has(`${item.type}-${item.id}`));
  return (
    <div className="member-home">
      <h1 className="sr-only">{firstName ? c.hello(firstName) : pet.name}</h1>
      {switchError ? <p role="alert">{c.unavailable}</p> : null}
      <GlassMemberHome locale={locale} userName={firstName ?? null} pet={pet} overview={overview} pets={pets} activePetId={petId} careFailed={careFailed} onRetryCare={load} permission={permission} isSwitching={isSwitching} onSwitch={(id) => { setSwitchError(false); void switchActivePet(id).catch(() => setSwitchError(true)); }} />

      <div className="member-home__layout">
        <div className="member-home__main">
          {permission.access?.canViewHealth ? <section className="member-home__card" aria-labelledby="home-health">
            <div className="member-home__card-head">
              <h2 id="home-health">{c.recentHealth}</h2>
              <Link href={`${petBase}/health`}>{c.allHealth}</Link>
            </div>
            {overview.recentHealth.length === 0 ? (
              <p className="member-home__empty">{c.noRecentHealth}</p>
            ) : (
              <ul className="member-home__list">
                {overview.recentHealth.slice(0, 4).map((item) => (
                  <li key={`${item.type}-${item.id}`}>
                    <Link href={petBase + item.href}>
                      <span className="member-home__item-text">
                        <strong>{eventTitle(item.title, locale)}</strong>
                        <span>{formatOverviewDate(item.occurredAt, locale)}{item.providerName ? ` · ${item.providerName}` : ""}</span>
                      </span>
                      <Forward size={16} aria-hidden="true" className="member-home__go" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section> : null}
          {/* Activity repeats nothing already listed under recent health — only care, memories and older records. */}
          {activity.length > 0 || overview.recentHealth.length === 0 ? <section className="member-home__card" aria-labelledby="home-activity">
            <div className="member-home__card-head"><h2 id="home-activity">{c.recentActivity}</h2></div>
            {activity.length === 0 ? <p className="member-home__empty">{c.noActivity}</p> : (
              <ul className="member-home__list member-home__timeline">
                {activity.slice(0, 4).map((item) => (
                  <li key={`${item.type}-${item.id}`}>
                    <Link href={item.href.startsWith("/bookings/") ? `/${locale}${item.href}` : petBase + item.href}>
                      <span className="member-home__timeline-dot" aria-hidden="true" />
                      <span className="member-home__item-text"><strong>{eventTitle(item.title, locale)}</strong><span>{formatOverviewDate(item.occurredAt, locale)} · {item.providerName ?? eventSourceLabel(item, locale)}</span></span>
                      <Forward size={16} aria-hidden="true" className="member-home__go" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section> : null}
        </div>

        <aside className="member-home__side">
          <section className="member-home__card" aria-labelledby="home-next">
            <h2 id="home-next">{c.next}</h2>
            {nextBooking === "failed" ? <div role="status"><p>{c.unavailable}</p><button type="button" onClick={load}>{c.retry}</button></div> : nextBooking ? (
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

          <section className="member-home__card" aria-labelledby="home-membership">
            <div className="member-home__card-head">
              <h2 id="home-membership"><Sparkles size={16} aria-hidden="true" /> {c.membership}</h2>
              {membership && membership !== "failed" ? <Link href={`/${locale}/subscription`}>{membership === "none" ? c.seePlans : c.manage}</Link> : null}
            </div>
            {membership === null ? (
              <Skeleton className="h-10 w-full" />
            ) : membership === "failed" ? (
              <p className="member-home__empty">{c.unavailable}</p>
            ) : membership === "none" ? (
              <p className="member-home__empty">{c.noMembership}</p>
            ) : (
              <div className="member-home__fact-row">
                <strong>{locale === "fa" ? membership.plan.nameFa : membership.plan.nameEn}</strong>
                <StatusLabel tone="success">{statusLabel(membership.status, locale, "subscription")}</StatusLabel>
                {membership.trialEndsAt && membership.status === "TRIALING" ? <span>{c.trialUntil} {formatDay(membership.trialEndsAt.slice(0, 10), locale)}</span> : membership.currentPeriod?.endAt ? <span>{c.renewsOn} {formatDay(membership.currentPeriod.endAt.slice(0, 10), locale)}</span> : null}
              </div>
            )}
          </section>

          <section className="member-home__card" aria-labelledby="home-orders">
            <div className="member-home__card-head">
              <h2 id="home-orders">{c.orders}</h2>
              {Array.isArray(orders) && orders.length ? <Link href={`/${locale}/orders`}>{c.allOrders}</Link> : null}
            </div>
            {orders === null ? (
              <Skeleton className="h-10 w-full" />
            ) : orders === "failed" ? (
              <p className="member-home__empty">{c.unavailable}</p>
            ) : orders.length === 0 ? (
              <p className="member-home__empty">{c.noOrders} <Link href={`/${locale}/shop`} className="member-home__inline">{c.shopLink}</Link></p>
            ) : (
              <ul className="member-home__list">
                {[...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 2).map((o) => (
                  <li key={o.id}>
                    <Link href={`/${locale}/orders/${o.id}`}>
                      <span className="member-home__next-icon member-home__next-icon--sm"><PackageCheck size={18} aria-hidden="true" /></span>
                      <span className="member-home__item-text">
                        <strong>{o.previewTitles[0] ?? o.orderNumber}</strong>
                        <span>{statusLabel(o.status, locale, "order")} · {formatCurrency(o.totalAmount, locale)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="member-home__card" aria-labelledby="home-trips">
            <div className="member-home__card-head">
              <h2 id="home-trips">{c.trips}</h2>
              <Link href={`/${locale}/travel`}>{c.findStay}</Link>
            </div>
            {trips === null ? (
              <Skeleton className="h-10 w-full" />
            ) : trips === "failed" ? (
              <p className="member-home__empty">{c.unavailable}</p>
            ) : trips.length === 0 ? (
              <p className="member-home__empty">{c.noTrips}</p>
            ) : (
              <ul className="member-home__list">
                {trips.slice(0, 2).map((t) => (
                  <li key={t.id}>
                    <Link href={`/${locale}/travel/bookings/${t.id}`}>
                      <span className="member-home__next-icon member-home__next-icon--sm"><Plane size={18} aria-hidden="true" /></span>
                      <span className="member-home__item-text">
                        <strong>{t.listingTitle}</strong>
                        <span>{t.listingCity} · {formatDay(t.checkIn.slice(0, 10), locale, { year: false })} · {statusLabel(t.status, locale, "travelBooking")}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <DashboardExplore locale={locale} />
    </div>
  );
}

function DashboardExplore({ locale }: { locale: "fa" | "en" }) {
  const c = COPY[locale];
  return <nav className="member-home__explore" aria-label={c.explore}>
        <h2>{c.explore}</h2>
        <div>
          <Link href={`/${locale}/services`}><Scissors size={18} aria-hidden="true" />{c.services}</Link>
          <Link href={`/${locale}/vet/find`}><Stethoscope size={18} aria-hidden="true" />{c.vets}</Link>
          <Link href={`/${locale}/shop`}><ShoppingBag size={18} aria-hidden="true" />{c.shopLink}</Link>
          <Link href={`/${locale}/travel`}><MapPin size={18} aria-hidden="true" />{c.stays}</Link>
          <Link href={`/${locale}/community`}><Users size={18} aria-hidden="true" />{c.community}</Link>
        </div>
      </nav>;
}
