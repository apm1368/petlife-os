"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { ContextSurface } from "@petlife/ui";
import { ServiceCategory } from "@petlife/types";
import { useActivePet } from "@/hooks/use-active-pet";

const CATEGORIES = [
  ServiceCategory.GROOMING,
  ServiceCategory.TRAINING,
  ServiceCategory.WALKING,
  ServiceCategory.SITTING,
  ServiceCategory.BOARDING,
  ServiceCategory.PET_TAXI,
];

/**
 * Active Pet -> category tiles (spec section 29). No compatibility is
 * computed on this screen itself — the Active Pet's id simply flows through
 * as the `petId` query param on the next (Service Results) screen, so
 * switching the active pet before navigating here always recalculates
 * compatibility from scratch rather than caching a stale result.
 */
export function ExploreServicesView() {
  const t = useTranslations("services.explore");
  const router = useRouter();
  const locale = useLocale();
  const { activePet } = useActivePet();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        {activePet ? <p className="mt-1 text-body text-text-secondary">{t("subtitle", { name: activePet.name })}</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            className="text-start"
            onClick={() => router.push(`/${locale}/services/${category}`)}
          >
            <ContextSurface className="flex flex-col gap-1">
              <p className="text-body font-medium text-text-primary">{t(`category.${category}`)}</p>
              <p className="text-metadata text-text-secondary">{t(`categoryHint.${category}`)}</p>
            </ContextSurface>
          </button>
        ))}
      </div>
    </div>
  );
}
