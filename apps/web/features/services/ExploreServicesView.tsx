"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { CarFront, Dog, Footprints, GraduationCap, House, Scissors, Search } from "@petlife/ui";
import { ServiceCategory } from "@petlife/types";
import { CinematicPageHero } from "@/features/experience/CinematicPageHero";
import { useActivePet } from "@/hooks/use-active-pet";

const CATEGORIES = [
  { value: ServiceCategory.GROOMING, fa: "آرایش و شست‌وشو", en: "Grooming", hintFa: "اصلاح، حمام و مراقبت تخصصی", hintEn: "Bath, haircut and specialist care", icon: Scissors },
  { value: ServiceCategory.TRAINING, fa: "آموزش", en: "Training", hintFa: "مربی خصوصی و کلاس‌های رفتاری", hintEn: "Private trainers and behaviour classes", icon: GraduationCap },
  { value: ServiceCategory.WALKING, fa: "پیاده‌روی", en: "Walking", hintFa: "پیاده‌روی امن و قابل‌ردیابی", hintEn: "Safe, trackable walks", icon: Footprints },
  { value: ServiceCategory.SITTING, fa: "نگهداری در منزل", en: "Sitting", hintFa: "همراه مطمئن در خانه شما", hintEn: "Trusted care in your home", icon: Dog },
  { value: ServiceCategory.BOARDING, fa: "پانسیون", en: "Boarding", hintFa: "اقامت شبانه با گزارش روزانه", hintEn: "Overnight stays with daily updates", icon: House },
  { value: ServiceCategory.PET_TAXI, fa: "تاکسی حیوانات", en: "Pet Taxi", hintFa: "جابجایی ایمن درون‌شهری", hintEn: "Safe city transportation", icon: CarFront },
];

export function ExploreServicesView() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("services.explore");
  const { activePet } = useActivePet();
  const fa = locale === "fa";
  return <div className="experience-stack">
    <CinematicPageHero image="/images/experience/grooming-hero.png" eyebrow={fa ? "متخصص‌های قابل اعتماد، یک‌جا" : "TRUSTED PET PROFESSIONALS"} title={fa ? "مراقبت حرفه‌ای، نزدیک شما" : "Professional care, near you"} description={fa ? "خدمات را بر اساس زمان، محله، نیاز حیوان و تجربه متخصص مقایسه کنید و رزرو را در چند قدم انجام دهید." : "Compare services by time, location, pet needs and professional experience, then book in a few steps."}>
      <form className="experience-search" onSubmit={(event) => { event.preventDefault(); router.push(`/${locale}/services/${ServiceCategory.GROOMING}`); }} role="search"><label><Search size={20} aria-hidden="true" /><input aria-label={fa ? "جست‌وجوی خدمات" : "Search services"} placeholder={fa ? "چه خدمتی نیاز دارید؟" : "What service do you need?"} /></label><button type="submit">{fa ? "پیدا کن" : "Find care"}</button></form>
    </CinematicPageHero>
    {activePet ? <p className="experience-preview-note">{t("subtitle", { name: activePet.name })}</p> : null}
    <section className="experience-section"><div className="experience-section__head"><div><h2>{fa ? "انتخاب خدمت" : "Choose a service"}</h2><p>{fa ? "هر خدمت با متخصص، زمان‌بندی و استانداردهای خودش" : "Each service with its own professionals, schedule and standards"}</p></div></div><div className="experience-grid">
      {CATEGORIES.map((item) => { const Icon = item.icon; return <button key={item.value} type="button" className="experience-tile" onClick={() => router.push(`/${locale}/services/${item.value}`)}><span className="experience-tile__icon"><Icon size={23} aria-hidden="true" /></span><div><h3>{fa ? item.fa : item.en}</h3><p>{fa ? item.hintFa : item.hintEn}</p></div></button>; })}
    </div></section>
  </div>;
}
