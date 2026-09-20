"use client";

import Image from "next/image";
import Link from "next/link";
import { useLocale } from "next-intl";

const sideLinks = [
  ["pets/active?view=health", "سلامت"], ["care-calendar", "مراقبت‌ها"], ["services", "خدمات"],
  ["shop", "فروشگاه"], ["pets/active?view=travel", "سفر"], ["insurance", "بیمه"],
  ["pets/active?view=memories", "خاطرات"], ["animal-support", "حمایت از حیوانات"], ["ai", "همراه هوشمند"],
  ["account", "پروفایل"],
] as const;

export function ApprovedDashboardView() {
  const locale = useLocale();
  return (
    <main className="approved-dashboard" aria-label={locale === "fa" ? "داشبورد کوکی" : "Cookie dashboard"}>
      <Image src="/images/dashboard/petlife-dashboard-approved.png" alt="" fill priority unoptimized sizes="100vw" />
      <nav className="approved-dashboard__nav" aria-label={locale === "fa" ? "منوی داشبورد" : "Dashboard navigation"}>
        <Link className="approved-dashboard__home" href={`/${locale}/home`} aria-label={locale === "fa" ? "داشبورد" : "Dashboard"} />
        {sideLinks.map(([href, label], index) => <Link key={href} style={{ "--nav-index": index } as React.CSSProperties} href={`/${locale}/${href}`} aria-label={label} />)}
      </nav>
      <Link className="approved-dashboard__add-pet" href={`/${locale}/pets/new`} aria-label={locale === "fa" ? "افزودن حیوان" : "Add pet"} />
      <Link className="approved-dashboard__pet-profile" href={`/${locale}/pets/active`} aria-label={locale === "fa" ? "پروفایل کوکی" : "Cookie profile"} />
      <Link className="approved-dashboard__walk" href={`/${locale}/care-calendar`} aria-label={locale === "fa" ? "شروع پیاده‌روی" : "Start walk"} />
      <Link className="approved-dashboard__appointment" href={`/${locale}/bookings`} aria-label={locale === "fa" ? "مدیریت نوبت" : "Manage appointment"} />
      <Link className="approved-dashboard__photo" href={`/${locale}/pets/active`} aria-label={locale === "fa" ? "تغییر عکس کوکی" : "Change Cookie photo"} />
      <button className="approved-dashboard__cinematic" type="button" aria-label={locale === "fa" ? "ساخت تصویر سینمایی" : "Create cinematic image"} />
    </main>
  );
}
