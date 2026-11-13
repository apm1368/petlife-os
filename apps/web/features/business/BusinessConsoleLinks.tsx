"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

/** In the provider and seller consoles: back to the business home, and a way to reach opetlife support. */
export function BusinessConsoleLinks({ supportCategory }: { supportCategory: "PROVIDER" | "SELLER" }) {
  const t = useTranslations("businessHub");
  const locale = useLocale();
  return (
    <span className="flex items-center gap-3 text-sm">
      <Link className="inline-flex min-h-11 items-center underline" href={`/${locale}/business`}>
        {t("homeLink")}
      </Link>
      <Link className="inline-flex min-h-11 items-center underline" href={`/${locale}/support/new?category=${supportCategory}`}>
        {t("support")}
      </Link>
    </span>
  );
}
