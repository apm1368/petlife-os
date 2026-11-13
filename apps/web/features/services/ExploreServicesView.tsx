"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BadgeCheck, CarFront, ChevronLeft, ChevronRight, Dog, Footprints, GraduationCap, House, Scissors, Search, Stethoscope } from "@petlife/ui";
import { useState } from "react";
import { ServiceCategory } from "@petlife/types";
import { useActivePet } from "@/hooks/use-active-pet";
import { DiscoveryPage } from "@/features/discovery/DiscoveryPage";
import { serviceCategorySlug } from "@/lib/services/category-slug";

const CATEGORIES = [
  { value: ServiceCategory.VET, icon: Stethoscope },
  { value: ServiceCategory.GROOMING, icon: Scissors },
  { value: ServiceCategory.TRAINING, icon: GraduationCap },
  { value: ServiceCategory.WALKING, icon: Footprints },
  { value: ServiceCategory.SITTING, icon: Dog },
  { value: ServiceCategory.BOARDING, icon: House },
  { value: ServiceCategory.PET_TAXI, icon: CarFront },
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
  const [text, setText] = useState("");
  const Go = locale === "fa" ? ChevronLeft : ChevronRight;
  return (
    <DiscoveryPage kind="services"><div className="disc">
      <header className="disc-head">
        <div className="disc-head__text">
          <p className="disc-head__eyebrow"><BadgeCheck size={16} aria-hidden="true" />{t("eyebrow")}</p>
          <h1>{t("heading")}</h1>
          <p>{t("description")}</p>
          {activePet ? <p className="svc-home__pet">{t("subtitle", { name: activePet.name })}</p> : null}
        </div>
        <form className="disc-search" onSubmit={(event) => { event.preventDefault(); router.push(`/${locale}/services/search${text.trim() ? `?q=${encodeURIComponent(text.trim())}` : ""}`); }} role="search">
          <Search size={18} aria-hidden="true" />
          <input value={text} onChange={(event) => setText(event.target.value)} aria-label={t("searchLabel")} placeholder={t("searchPlaceholder")} />
          <button type="submit">{t("searchButton")}</button>
        </form>
      </header>
      <section aria-labelledby="svc-cats-title" className="svc-home">
        <h2 id="svc-cats-title">{t("chooseService")}</h2>
        <ul className="svc-cats">
          {CATEGORIES.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.value}>
                <Link href={`/${locale}/services/${serviceCategorySlug(item.value)}`} className="svc-cat">
                  <span className="svc-cat__icon"><Icon size={22} aria-hidden="true" /></span>
                  <span className="svc-cat__text"><strong>{t(`category.${item.value}`)}</strong><small>{t(`categoryHint.${item.value}`)}</small></span>
                  <Go size={18} aria-hidden="true" className="svc-cat__go" />
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="disc-note">
          {t("allProvidersIntro")} {" "}
          <Link href={`/${locale}/services/search`} className="svc-home__all">{t("allServices")}</Link>
        </p>
      </section>
    </div></DiscoveryPage>
  );
}
