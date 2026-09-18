"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { BadgeCheck, CalendarDays, Clock3, EmptyState, ErrorRecovery, MapPin, Search, ShieldCheck, SlidersHorizontal, Star, Stethoscope } from "@petlife/ui";
import type { ProviderSummaryDto } from "@petlife/types";
import { providersService } from "@/services/providers.service";
import { useActivePet } from "@/hooks/use-active-pet";
import { isLocalPreview } from "@/lib/local-preview";
import { CinematicPageHero } from "@/features/experience/CinematicPageHero";

const VET_PREVIEW = [
  { id: "v1", name: "کلینیک دامپزشکی رویال", service: "داخلی · واکسیناسیون · تصویربرداری", city: "نیاوران", time: "امروز، ۱۸:۲۰", score: "۴٫۹", image: "/images/experience/vet-hero.png", position: "70% center" },
  { id: "v2", name: "بیمارستان دامپزشکی مرکزی", service: "اورژانس ۲۴ ساعته · جراحی", city: "ونک", time: "امروز، ۱۹:۰۰", score: "۴٫۸", image: "/images/landing/pet-portrait.png", position: "72% center" },
  { id: "v3", name: "کلینیک گربه ایرانیان", service: "تخصصی گربه · آزمایشگاه", city: "پاسداران", time: "فردا، ۹:۳۰", score: "۴٫۹", image: "/images/experience/shop-hero.png", position: "73% center" },
  { id: "v4", name: "مرکز تخصصی دکتر راد", service: "پوست و مو · تغذیه", city: "سعادت‌آباد", time: "فردا، ۱۱:۱۵", score: "۴٫۷", image: "/images/experience/grooming-hero.png", position: "72% center" },
  { id: "v5", name: "دامپزشک همراه پت‌لایف", service: "ویزیت در منزل · پیگیری آنلاین", city: "سرویس در محل", time: "شنبه، ۱۰:۰۰", score: "۴٫۸", image: "/images/landing/cookie-world-day-clean.png", position: "60% center" },
];

type DisplayVet = typeof VET_PREVIEW[number] & { raw?: ProviderSummaryDto };

export function FindVetView() {
  const router = useRouter();
  const t = useTranslations("vet.find");
  const locale = useLocale();
  const fa = locale === "fa";
  const { activePet } = useActivePet();
  const [providers, setProviders] = useState<ProviderSummaryDto[] | null>(null);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [emergency, setEmergency] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    void providersService.searchVets(activePet ? { species: activePet.species } : {}).then((value) => { if (!cancelled) setProviders(value); }).catch(() => { if (!cancelled && isLocalPreview()) { setProviders([]); setPreview(true); } else if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [activePet?.species, retry]);

  const cards = useMemo<DisplayVet[]>(() => {
    const source = providers?.length ? providers.map((provider, index) => ({ id: provider.id, name: provider.name, service: provider.services.map((service) => service.name).join(" · "), city: provider.locations[0]?.city ?? (fa ? "ویزیت در محل" : "At-home visit"), time: provider.nextAvailableSlotStart ? new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(provider.nextAvailableSlotStart)) : t("noAvailability"), score: "—", image: VET_PREVIEW[index % VET_PREVIEW.length]!.image, position: VET_PREVIEW[index % VET_PREVIEW.length]!.position, raw: provider })) : VET_PREVIEW;
    const normalized = query.trim().toLowerCase();
    return source.filter((item) => (!normalized || `${item.name} ${item.service} ${item.city}`.toLowerCase().includes(normalized)) && (!emergency || item.service.includes(fa ? "اورژانس" : "Emergency")));
  }, [emergency, fa, providers, query, t]);

  if (error) return <ErrorRecovery title={fa ? "دامپزشکی در دسترس نیست" : "Vet discovery unavailable"} message="" retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={() => setRetry((value) => value + 1)} />;
  return <div className="experience-stack">
    <CinematicPageHero compact image="/images/experience/vet-hero.png" eyebrow={fa ? "سلامت، بدون حدس" : "CARE WITH CLARITY"} title={fa ? "دامپزشک مناسب را پیدا کنید" : "Find the right veterinarian"} description={fa ? "تخصص، زمان آزاد و امکانات کلینیک را یک‌جا مقایسه کنید؛ برای ویزیت حضوری، منزل یا پیگیری آنلاین." : "Compare expertise, availability and facilities for clinic, at-home or online follow-up care."}>
      <div className="experience-search"><label><Search size={20} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={fa ? "نام کلینیک، تخصص یا محله…" : "Clinic, specialty or area…"} /></label><button type="button"><SlidersHorizontal size={18} aria-hidden="true" />{fa ? "فیلتر" : "Filters"}</button></div>
    </CinematicPageHero>
    {preview ? <p className="experience-preview-note">{fa ? "۵ کلینیک واقعی‌نما برای پیش‌نمایش. امتیازها، بیمه‌های قابل‌پذیرش، صف اورژانس و مشاوره آنلاین در بک‌لاگ اتصال بک‌اند ثبت شده‌اند." : "Five realistic clinics for preview. Ratings, accepted insurance, emergency queue and telehealth are tracked in the backend backlog."}</p> : null}
    {providers?.some((provider) => provider.verificationStatus === "VERIFIED") ? <div><span className="experience-badge"><BadgeCheck size={14} aria-hidden="true" />{fa ? "ارائه‌دهنده تاییدشده" : "Verified"}</span></div> : null}
    {providers?.length === 0 && !preview ? <EmptyState title={t("empty")} /> : null}
    <div className="experience-toolbar"><div className="experience-pills"><button type="button" className="experience-pill" aria-pressed={emergency} onClick={() => setEmergency((value) => !value)}>{fa ? "اورژانس ۲۴ ساعته" : "24/7 emergency"}</button><button type="button" className="experience-pill">{fa ? "امروز وقت دارد" : "Available today"}</button><button type="button" className="experience-pill">{fa ? "ویزیت در منزل" : "At-home visit"}</button><button type="button" className="experience-pill">{fa ? "مشاوره آنلاین" : "Telehealth"}</button></div><span>{cards.length.toLocaleString(locale)} {fa ? "مرکز درمانی" : "providers"}</span></div>
    <div className="experience-grid">{cards.map((item) => <button key={item.id} className="experience-card" type="button" onClick={() => item.raw && router.push(`/${locale}/vet/${item.raw.id}`)} aria-disabled={!item.raw}><div className="experience-card__media"><Image src={item.image} alt="" fill sizes="(max-width:600px) 100vw, 33vw" style={{ objectPosition: item.position }} /></div><div className="experience-card__body"><div className="experience-card__row"><span className="experience-badge"><BadgeCheck size={14} aria-hidden="true" />{fa ? "مجوز تاییدشده" : "Verified licence"}</span><span className="experience-badge experience-badge--gold"><Star size={13} aria-hidden="true" />{item.score}</span></div><h3 className="mt-3">{item.name}</h3><p>{item.service}</p><div className="experience-meta"><span><MapPin size={14} aria-hidden="true" />{item.city}</span><span><Clock3 size={14} aria-hidden="true" />{item.time}</span><span><ShieldCheck size={14} aria-hidden="true" />{fa ? "پرونده امن" : "Secure record"}</span></div><div className="experience-price"><Stethoscope size={17} className="inline" aria-hidden="true" /> {fa ? "مشاهده پروفایل و رزرو" : "View profile & book"}</div></div></button>)}</div>
    <section className="experience-tile"><span className="experience-tile__icon"><CalendarDays size={23} aria-hidden="true" /></span><div><h3>{fa ? "ویزیت بعدی را فراموش نکنید" : "Never miss the next visit"}</h3><p>{fa ? "یادآوری واکسن و دارو پس از اتصال پرونده سلامت به‌صورت خودکار نمایش داده می‌شود." : "Vaccination and medication reminders appear after connecting the health record."}</p></div></section>
  </div>;
}
