"use client";
import Link from "next/link";
import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import { CalendarDays, HeartPulse, House, Images, PawPrint, ShoppingBag } from "@petlife/ui";
import type { PetAccessFlags } from "@petlife/types";
import { useActivePet } from "@/hooks/use-active-pet";
const copy = { fa: { nav: "بخش‌های من", home: "داشبورد", profile: "پروفایل حیوان", health: "سلامت", care: "مراقبت‌ها", memories: "خاطرات", shop: "فروشگاه" }, en: { nav: "My sections", home: "Dashboard", profile: "Pet profile", health: "Health", care: "Care", memories: "Memories", shop: "Shop" } };
export function MemberGlassDock({ access }: { access: PetAccessFlags | null }) {
  const locale = useLocale() === "en" ? "en" : "fa";
  const c = copy[locale];
  const pathname = usePathname();
  const { activePet, pets } = useActivePet();
  const pet = activePet ?? pets[0];
  const base = pet ? `/pets/${pet.id}` : "/pets";
  const links = [{ href: "/home", label: c.home, Icon: House }, { href: base, label: c.profile, Icon: PawPrint }, ...(pet && access?.canViewHealth ? [{ href: `${base}/health`, label: c.health, Icon: HeartPulse }] : []), ...(pet && access?.canViewCareProfile ? [{ href: `${base}/care`, label: c.care, Icon: CalendarDays }] : []), ...(pet ? [{ href: `${base}/memories`, label: c.memories, Icon: Images }] : []), { href: "/shop", label: c.shop, Icon: ShoppingBag }];
  return <nav className="glass-dock" aria-label={c.nav}>{links.map(({ href, label, Icon }) => <Link key={href} href={`/${locale}${href}`} aria-label={label} title={label} aria-current={pathname === `/${locale}${href}` ? "page" : undefined}><Icon size={23} aria-hidden="true" /><span>{label}</span></Link>)}</nav>;
}
