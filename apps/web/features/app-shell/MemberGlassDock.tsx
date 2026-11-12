"use client";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { CalendarDays, HeartPulse, House, Images, PawPrint, ShoppingBag } from "@petlife/ui";
import type { PetAccessFlags } from "@petlife/types";
import { useActivePet } from "@/hooks/use-active-pet";
import { Bird } from "@/features/landing/opl/Bird";
import { isRouteLocale, type RouteLocale } from "@/lib/i18n/config";
/** The side dock of personal records, with a budgie perched on top; links and labels follow the page language. */
export function MemberGlassDock({ access }: { access: PetAccessFlags | null }) {
  const raw = useLocale();
  const locale: RouteLocale = isRouteLocale(raw) ? raw : "en";
  const t = useTranslations("pattern2026.member");
  const c = { nav: t("nav"), home: t("home"), profile: t("profile"), health: t("health"), care: t("care"), memories: t("memories"), shop: t("shop") };
  const pathname = usePathname();
  const { activePet, pets } = useActivePet();
  const pet = activePet ?? pets[0];
  const base = pet ? `/pets/${pet.id}` : "/pets";
  const links = [{ href: "/home", label: c.home, Icon: House }, { href: base, label: c.profile, Icon: PawPrint }, ...(pet && access?.canViewHealth ? [{ href: `${base}/health`, label: c.health, Icon: HeartPulse }] : []), ...(pet && access?.canViewCareProfile ? [{ href: `${base}/care`, label: c.care, Icon: CalendarDays }] : []), ...(pet ? [{ href: `${base}/memories`, label: c.memories, Icon: Images }] : []), { href: "/shop", label: c.shop, Icon: ShoppingBag }];
  return <nav className="glass-dock" aria-label={c.nav}><Bird kind="budgie" style={{ top: -40, insetInlineStart: 9 }} />{links.map(({ href, label, Icon }) => <Link key={href} href={`/${locale}${href}`} aria-label={label} title={label} aria-current={pathname === `/${locale}${href}` ? "page" : undefined}><Icon size={23} aria-hidden="true" /><span>{label}</span></Link>)}</nav>;
}
