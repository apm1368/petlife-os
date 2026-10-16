"use client";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
export function AdminAnimalSupportNav() {
  const lang = useLocale();
  const t = useTranslations("supportOpsNav");
  const pathname = usePathname() ?? "";
  const ops = useTranslations("supportOps");
  const items = [
    { href: `/${lang}/admin/animal-support`, label: t("overview"), exact: true },
    { href: `/${lang}/admin/animal-support/needs`, label: t("needs") },
    { href: `/${lang}/admin/animal-support/organizations`, label: t("organizations") },
    { href: `/${lang}/admin/animal-support/rescue-cases`, label: ops("rescues") },
    { href: `/${lang}/admin/animal-support/campaigns`, label: ops("campaigns") },
    { href: `/${lang}/admin/animal-support/donations`, label: t("donations") },
    { href: `/${lang}/admin/lost-pets`, label: t("lostPets") },
    { href: `/${lang}/admin/community`, label: t("reports") },
    { href: `/${lang}/admin/trust`, label: t("trust") },
  ];
  return (
    <nav aria-label={t("label")} className="mb-4 flex gap-1 overflow-x-auto border-b border-border-subtle">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap px-3 py-2 text-sm ${active ? "border-b-2 border-brand-natural font-bold" : "text-text-secondary"}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
