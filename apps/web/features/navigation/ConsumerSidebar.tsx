"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import {
  Avatar,
  House,
  Dog,
  HeartPulse,
  CalendarDays,
  Scissors,
  Stethoscope,
  ShoppingBag,
  MapPin,
  UserRound,
  ShieldCheck,
  Menu,
  Sheet,
  Button,
} from "@petlife/ui";
import { useState } from "react";
import { useSessionStore } from "@/stores/session-store";
const items = [
  ["/home", "خانه", "Dashboard", House],
  ["/pets", "حیوانات من", "My pets", Dog],
  ["/pets/active?view=health", "سلامت", "Health", HeartPulse],
  ["/pets/active?view=care", "مراقبت‌ها", "Care", CalendarDays],
  ["/services", "خدمات", "Services", Scissors],
  ["/vet/find", "دامپزشک", "Vet", Stethoscope],
  ["/shop", "فروشگاه", "Shop", ShoppingBag],
  ["/pets/active?view=travel", "سفر", "Travel", MapPin],
  ["/places", "مکان‌های دوستدار حیوانات", "Pet-friendly places", MapPin],
  ["/community", "جامعه", "Community", UserRound],
  ["/animal-support", "حمایت حیوانات", "Animal support", HeartPulse],
  ["/blog", "محتوا و راهنما", "Articles", CalendarDays],
  ["/support", "پشتیبانی", "Support", ShieldCheck],
  ["/profile", "پروفایل", "Profile", UserRound],
] as const;
export function ConsumerSidebar() {
  const locale = useLocale();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const user = useSessionStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const path = pathname.replace(new RegExp("^/" + locale), "");
  function active(href: string) {
    if (href.includes("?view=")) {
      const [base, view] = href.split("?view=");
      return path === base && searchParams.get("view") === view;
    }
    if (href === "/pets") return path === "/pets" || /^\/pets\/[^/]+$/.test(path);
    return path === href || path.startsWith(href + "/");
  }
  const links = (
    <>
      {items.map(([href, fa, en, Icon]) => (
        <Link
          key={href}
          href={"/" + locale + href}
          aria-current={active(href) ? "page" : undefined}
          onClick={() => setOpen(false)}
        >
          <Icon size={18} aria-hidden="true" />
          <span>{locale === "fa" ? fa : en}</span>
        </Link>
      ))}
    </>
  );
  return (
    <aside className="consumer-sidebar">
      <div className="consumer-sidebar-desktop">
        <Link className="consumer-brand" href={"/" + locale}>
          PET LIFE OS
        </Link>
        <nav aria-label={locale === "fa" ? "منوی اصلی" : "Main navigation"}>{links}</nav>
        {user && (
          <Link className="consumer-account" href={"/" + locale + "/profile"}>
            <Avatar name={user.displayName} src={user.avatarUrl} size="sm" />
            <span>{user.displayName}</span>
          </Link>
        )}
      </div>
      <div className="consumer-mobile-menu">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Menu size={18} />
          {locale === "fa" ? "منوی اصلی" : "Menu"}
        </Button>
      </div>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={locale === "fa" ? "بخش‌های پت‌لایف" : "PET LIFE sections"}
      >
        <nav className="consumer-drawer-links">{links}</nav>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          {locale === "fa" ? "بستن" : "Close"}
        </Button>
      </Sheet>
    </aside>
  );
}
