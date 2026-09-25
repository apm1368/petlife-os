"use client";
import Link from "next/link";
import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";

const sections = [
  ["", "نمای کلی", "Overview"],
  ["/personal", "اطلاعات شخصی", "Personal"],
  ["/security", "امنیت", "Security"],
  ["/privacy", "حریم خصوصی", "Privacy"],
  ["/household", "خانواده و دسترسی", "Household & access"],
  ["/notifications", "اعلان‌ها", "Notifications"],
  ["/activity", "فعالیت‌ها", "Activity"],
] as const;

export function AccountNav() {
  const locale = useLocale();
  const pathname = usePathname() ?? "";
  return <nav className="account-nav" aria-label={locale === "fa" ? "مدیریت حساب" : "Account settings"}>
    <p>{locale === "fa" ? "حساب کاربری" : "ACCOUNT"}</p>
    {sections.map(([suffix, fa, en]) => {
      const href = `/${locale}/profile${suffix}`;
      const active = suffix ? pathname.startsWith(href) : pathname === href;
      return <Link key={suffix || "overview"} href={href} aria-current={active ? "page" : undefined}>{locale === "fa" ? fa : en}</Link>;
    })}
  </nav>;
}

export function AccountPageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="account-page-header"><p>{eyebrow}</p><h1>{title}</h1><span>{description}</span></header>;
}
