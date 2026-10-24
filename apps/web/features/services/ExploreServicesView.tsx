"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BadgeCheck, CarFront, ChevronLeft, ChevronRight, Dog, Footprints, GraduationCap, House, Scissors, Search, Stethoscope } from "@petlife/ui";
import { useState } from "react";
import { ServiceCategory } from "@petlife/types";
import { useActivePet } from "@/hooks/use-active-pet";

const CATEGORIES = [
  { value: ServiceCategory.VET, fa: "دامپزشکی", en: "Veterinary", hintFa: "کلینیک، ویزیت در منزل و تخصص‌ها", hintEn: "Clinics, home visits and specialties", icon: Stethoscope },
  { value: ServiceCategory.GROOMING, fa: "آرایش و شست‌وشو", en: "Grooming", hintFa: "اصلاح، حمام و مراقبت تخصصی", hintEn: "Bath, haircut and specialist care", icon: Scissors },
  { value: ServiceCategory.TRAINING, fa: "آموزش", en: "Training", hintFa: "مربی خصوصی و کلاس‌های رفتاری", hintEn: "Private trainers and behaviour classes", icon: GraduationCap },
  { value: ServiceCategory.WALKING, fa: "پیاده‌روی", en: "Walking", hintFa: "پیاده‌روی امن و قابل‌ردیابی", hintEn: "Safe, trackable walks", icon: Footprints },
  { value: ServiceCategory.SITTING, fa: "نگهداری در منزل", en: "Sitting", hintFa: "همراه مطمئن در خانه شما", hintEn: "Trusted care in your home", icon: Dog },
  { value: ServiceCategory.BOARDING, fa: "پانسیون", en: "Boarding", hintFa: "اقامت شبانه با گزارش روزانه", hintEn: "Overnight stays with daily updates", icon: House },
  { value: ServiceCategory.PET_TAXI, fa: "تاکسی حیوانات", en: "Pet Taxi", hintFa: "جابجایی ایمن درون‌شهری", hintEn: "Safe city transportation", icon: CarFront },
];

/**
 * Services home: the same header + search as discovery, then one divided index of the real
 * categories (each opens its discovery list). No hero artwork and no tile wall.
 */
export function ExploreServicesView() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("services.explore");
  const { activePet } = useActivePet();
  const fa = locale === "fa";
  const [text, setText] = useState("");
  const Go = fa ? ChevronLeft : ChevronRight;
  return (
    <div className="disc">
      <header className="disc-head">
        <div className="disc-head__text">
          <p className="disc-head__eyebrow"><BadgeCheck size={16} aria-hidden="true" />{fa ? "متخصص‌های تأییدشده، یک‌جا" : "Verified professionals, in one place"}</p>
          <h1>{fa ? "مراقبت حرفه‌ای، نزدیک شما" : "Professional care, near you"}</h1>
          <p>{fa ? "خدمات را بر اساس زمان آزاد، محله، نیاز حیوان و تجربهٔ متخصص مقایسه کنید و در چند قدم رزرو کنید." : "Compare services by open times, area, your pet's needs and experience, then book in a few steps."}</p>
          {activePet ? <p className="svc-home__pet">{t("subtitle", { name: activePet.name })}</p> : null}
        </div>
        <form className="disc-search" onSubmit={(event) => { event.preventDefault(); router.push(`/${locale}/services/search${text.trim() ? `?q=${encodeURIComponent(text.trim())}` : ""}`); }} role="search">
          <Search size={18} aria-hidden="true" />
          <input value={text} onChange={(event) => setText(event.target.value)} aria-label={fa ? "جست‌وجوی خدمات" : "Search services"} placeholder={fa ? "چه خدمتی نیاز دارید؟" : "What service do you need?"} />
          <button type="submit">{fa ? "پیدا کن" : "Find care"}</button>
        </form>
      </header>
      <section aria-labelledby="svc-cats-title" className="svc-home">
        <h2 id="svc-cats-title">{fa ? "انتخاب خدمت" : "Choose a service"}</h2>
        <ul className="svc-cats">
          {CATEGORIES.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.value}>
                <Link href={`/${locale}/services/${item.value}`} className="svc-cat">
                  <span className="svc-cat__icon"><Icon size={22} aria-hidden="true" /></span>
                  <span className="svc-cat__text"><strong>{fa ? item.fa : item.en}</strong><small>{fa ? item.hintFa : item.hintEn}</small></span>
                  <Go size={18} aria-hidden="true" className="svc-cat__go" />
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="disc-note">
          {fa ? "همهٔ ارائه‌دهندگان را یک‌جا ببینید: " : "See every provider at once: "}
          <Link href={`/${locale}/services/search`} className="svc-home__all">{fa ? "همهٔ خدمات" : "All services"}</Link>
        </p>
      </section>
    </div>
  );
}
