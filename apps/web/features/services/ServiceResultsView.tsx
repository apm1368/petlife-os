"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { BadgeCheck, Clock3, EmptyState, ErrorRecovery, MapPin, Search, SlidersHorizontal, Sparkles, Star } from "@petlife/ui";
import type { ServiceCategory, ServiceSearchResultDto } from "@petlife/types";
import { servicesService } from "@/services/services.service";
import { useActivePet } from "@/hooks/use-active-pet";
import { useBookingStore } from "@/stores/booking-store";
import { isLocalPreview } from "@/lib/local-preview";
import { CinematicPageHero } from "@/features/experience/CinematicPageHero";

const PREVIEW = [
  { id: "g1", name: "استودیو پت آرا", service: "حمام و اصلاح کامل", city: "زعفرانیه", price: "۱٬۸۵۰٬۰۰۰ تومان", time: "امروز، ۱۷:۳۰", score: "۴٫۹", image: "/images/experience/grooming-hero.png", position: "72% center" },
  { id: "g2", name: "خانه زیبایی پاپی", service: "شست‌وشو و براشینگ", city: "پاسداران", price: "۱٬۲۰۰٬۰۰۰ تومان", time: "فردا، ۱۰:۰۰", score: "۴٫۸", image: "/images/landing/pet-portrait.png", position: "72% center" },
  { id: "g3", name: "گروومر همراه — نازنین", service: "اصلاح در محل", city: "سرویس در منزل", price: "۲٬۱۰۰٬۰۰۰ تومان", time: "امروز، ۱۹:۰۰", score: "۴٫۹", image: "/images/landing/cookie-world-day-clean.png", position: "60% center" },
  { id: "g4", name: "پت اسپا نیلا", service: "مراقبت پوست و مو", city: "شهرک غرب", price: "۱٬۶۸۰٬۰۰۰ تومان", time: "شنبه، ۱۲:۳۰", score: "۴٫۷", image: "/images/experience/shop-hero.png", position: "68% center" },
  { id: "g5", name: "آرایشگاه موکا", service: "اصلاح نژادی و ناخن", city: "نیاوران", price: "۱٬۹۵۰٬۰۰۰ تومان", time: "شنبه، ۱۵:۰۰", score: "۴٫۸", image: "/images/landing/cookie-taxi.png", position: "58% center" },
];

type DisplayService = typeof PREVIEW[number] & { raw?: ServiceSearchResultDto };

export function ServiceResultsView({ category }: { category: ServiceCategory }) {
  const tCategory = useTranslations("services.explore");
  const tResults = useTranslations("services.results");
  const tCompatibility = useTranslations("services.compatibility");
  const router = useRouter();
  const locale = useLocale();
  const fa = locale === "fa";
  const { activePet } = useActivePet();
  const updateBooking = useBookingStore((s) => s.update);
  const resetBooking = useBookingStore((s) => s.reset);
  const [results, setResults] = useState<ServiceSearchResultDto[] | null>(null);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    void servicesService.search({ category, petId: activePet?.id }).then((value) => { if (!cancelled) setResults(value); }).catch(() => { if (!cancelled && isLocalPreview()) { setResults([]); setPreview(true); } else if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [activePet?.id, category, retry]);

  const cards = useMemo<DisplayService[]>(() => {
    const live = results?.length ? results.map((result, index) => ({ id: `${result.provider.id}-${result.service.id}`, name: result.provider.name, service: result.service.name, city: result.location?.city ?? (fa ? "سرویس در محل" : "At home"), price: result.service.priceAmount ? `${result.service.priceAmount.toLocaleString(locale)} ${result.service.currency ?? ""}` : (fa ? "استعلام قیمت" : "Ask for price"), time: result.nextAvailableSlotStart ? new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(result.nextAvailableSlotStart)) : (fa ? "زمان آزاد ندارد" : "No availability"), score: "—", image: PREVIEW[index % PREVIEW.length]!.image, position: PREVIEW[index % PREVIEW.length]!.position, raw: result })) : PREVIEW;
    const normalized = query.trim().toLowerCase();
    return live.filter((item) => (!normalized || `${item.name} ${item.service} ${item.city}`.toLowerCase().includes(normalized)) && (!availableOnly || !item.time.includes(fa ? "ندارد" : "No")));
  }, [availableOnly, fa, locale, query, results]);

  function openBooking(item: DisplayService) {
    const result = item.raw;
    if (!result) return;
    resetBooking();
    updateBooking({ petId: activePet?.id ?? null, category: result.service.category, providerId: result.provider.id, providerName: result.provider.name, locationId: result.location?.id ?? null, locationLabel: result.location ? `${result.location.city} — ${result.location.addressLine}` : "", locationMode: result.service.locationMode, serviceId: result.service.id, serviceName: result.service.name, durationMinutes: result.service.durationMinutes, priceAmount: result.service.priceAmount, currency: result.service.currency });
    router.push(`/${locale}/services/${category}/${result.service.id}/book`);
  }

  if (error) return <ErrorRecovery title={fa ? "خدمات در دسترس نیست" : "Services unavailable"} message="" retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={() => setRetry((value) => value + 1)} />;
  return <div className="experience-stack">
    <CinematicPageHero compact image="/images/experience/grooming-hero.png" eyebrow={fa ? "رزرو متخصص" : "BOOK A PROFESSIONAL"} title={tCategory(`category.${category}`)} description={fa ? "پروفایل‌ها را مقایسه کنید، جزئیات پکیج را ببینید و نزدیک‌ترین زمان آزاد را بردارید." : "Compare profiles, inspect the package and pick the nearest available time."}>
      <div className="experience-search"><label><Search size={20} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={fa ? "نام متخصص، محله یا خدمت…" : "Professional, area or service…"} /></label><button type="button"><SlidersHorizontal size={18} aria-hidden="true" />{fa ? "فیلتر" : "Filters"}</button></div>
    </CinematicPageHero>
    {preview ? <p className="experience-preview-note">{fa ? "این ۵ پروفایل برای نمایش تجربه نهایی‌اند. امتیاز، نظر کاربران، تصاویر نمونه‌کار و افزودنی‌های خدمت نیازمند APIهای فهرست‌شده در بک‌لاگ هستند." : "These five profiles preview the final experience. Ratings, reviews, portfolio images and add-ons need the APIs listed in the backlog."}</p> : null}
    {results?.length === 0 && !preview ? <EmptyState title={tResults("empty")} /> : null}
    {results?.some((result) => result.compatibility) ? <div className="experience-pills">{results.map((result) => result.compatibility ? <span className="experience-badge" key={`${result.provider.id}-${result.service.id}-compatibility`}>{tCompatibility(`status.${result.compatibility.status}`)}</span> : null)}</div> : null}
    <div className="experience-toolbar"><div className="experience-pills"><button className="experience-pill" type="button" aria-pressed={availableOnly} onClick={() => setAvailableOnly((value) => !value)}>{fa ? "اولین زمان آزاد" : "Available soon"}</button><button className="experience-pill" type="button">{fa ? "در محل" : "At home"}</button><button className="experience-pill" type="button">{fa ? "امتیاز بالا" : "Top rated"}</button><button className="experience-pill" type="button">{fa ? "مناسب گربه" : "Cat friendly"}</button></div><span>{cards.length.toLocaleString(locale)} {fa ? "نتیجه" : "results"}</span></div>
    <div className="experience-grid">{cards.map((item) => <button key={item.id} className="experience-card" type="button" onClick={() => openBooking(item)} aria-disabled={!item.raw} title={!item.raw ? (fa ? "پیش‌نمایش؛ اتصال رزرو پس از API" : "Preview; booking connects after API") : undefined}><div className="experience-card__media"><Image src={item.image} alt="" fill sizes="(max-width:600px) 100vw, 33vw" style={{ objectPosition: item.position }} /></div><div className="experience-card__body"><div className="experience-card__row"><span className="experience-badge"><BadgeCheck size={14} aria-hidden="true" />{fa ? "هویت تاییدشده" : "Verified"}</span><span className="experience-badge experience-badge--gold"><Star size={13} aria-hidden="true" />{item.score}</span></div><h3 className="mt-3">{item.name}</h3><p>{item.service}</p><div className="experience-meta"><span><MapPin size={14} aria-hidden="true" />{item.city}</span><span><Clock3 size={14} aria-hidden="true" />{item.time}</span><span><Sparkles size={14} aria-hidden="true" />{fa ? "نمونه‌کار" : "Portfolio"}</span></div><div className="experience-price">{item.price}</div></div></button>)}</div>
  </div>;
}
