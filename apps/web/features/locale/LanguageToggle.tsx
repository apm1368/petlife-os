"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";

/**
 * The consumer header's language control: with two languages a single toggle naming the other one in its
 * own language (English / فارسی) is clearer than a select. It changes only the locale segment of the URL —
 * path, query and theme stay as they are.
 */
export function LanguageToggle() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const next = locale === "fa" ? "en" : "fa";
  return (
    <button
      type="button"
      className="language-toggle"
      lang={next}
      aria-label={locale === "fa" ? "تغییر زبان به انگلیسی" : "Switch language to Persian"}
      onClick={() => {
        const segments = pathname.split("/");
        segments[1] = next;
        router.push((segments.join("/") || "/") + window.location.search);
      }}
    >
      {next === "en" ? "English" : "فارسی"}
    </button>
  );
}
