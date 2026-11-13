"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { PetLifecycleStatus, type PetDto, type PetOverviewDto } from "@petlife/types";
import { Avatar, Bell, CalendarDays, ChevronLeft, ChevronRight, FileText, HeartPulse, Images, PawPrint, Plus, StatusLabel } from "@petlife/ui";
import { formatAge, speciesLabel } from "@/features/pets/pet-identity";
import { attentionTitle, eventTitle, formatOverviewDate, severityLabel, severityTone } from "@/features/pets/overview-labels";
import type { usePetAccess } from "@/hooks/use-pet-access";
import { glassHomeCopy } from "./glass-home-copy";
import type { RouteLocale } from "@/lib/i18n/config";
import "./glass-member-home.css";

/** A pet who has passed away: Home turns to memories, with no shopping or booking nudges (Handoff 18 memorial mode). */
export const isMemorialPet = (pet: Pick<PetDto, "lifecycleStatus">) => pet.lifecycleStatus === PetLifecycleStatus.DECEASED || pet.lifecycleStatus === PetLifecycleStatus.MEMORIAL;

/**
 * The top of the member home (owner, 2026-11-13, 2026-11 pattern): a context bar that stays visible while scrolling
 * (the household and every pet as a chip; tapping one switches the whole page), then the active pet's card with what
 * needs attention and what is coming up. For a pet in memorial mode the card becomes a calm remembrance.
 */
export function GlassMemberHome({ locale, userName, pet, overview, pets, activePetId, onSwitch, permission, isSwitching, careFailed, onRetryCare }: {
  locale: RouteLocale; userName: string | null; pet: PetDto; overview: PetOverviewDto;
  pets: PetDto[]; activePetId: string | null; permission: ReturnType<typeof usePetAccess>; isSwitching: boolean; careFailed: boolean; onRetryCare: () => void; onSwitch: (id: string) => void;
}) {
  const c = glassHomeCopy[locale];
  const hub = useTranslations("pattern2026.member.hub");
  const memorial = isMemorialPet(pet);
  const current = activePetId ?? pet.id;
  const base = `/${locale}/pets/${pet.id}`;
  const Forward = (locale === "fa" || locale === "ar") ? ChevronLeft : ChevronRight;
  const count = (n: number) => new Intl.NumberFormat(locale).format(n);
  const sections = [
    { href: `${base}/health`, label: c.health, Icon: HeartPulse },
    { href: `${base}/care`, label: c.care, Icon: CalendarDays },
    { href: base, label: c.profile, Icon: PawPrint },
    { href: `${base}/memories`, label: c.memories, Icon: Images },
    { href: `${base}/health/documents`, label: c.documents, Icon: FileText },
    { href: `${base}/travel`, label: c.travel, Icon: CalendarDays },
  ].filter(section => section.href === `${base}/health` || section.href === `${base}/health/documents` ? permission.access?.canViewHealth : section.href === `${base}/care` ? permission.access?.canViewCareProfile : section.href === `${base}/travel` ? !isMemorialPet(pet) : true);
  return <>
    {/* Household and pet context, always in view (sticky under the header on every screen size). */}
    <div className="member-context" role="region" aria-label={hub("contextLabel")}>
      {overview.householdName && permission.access?.canViewIdentity ? <div className="glass-home__household member-context__household" role="group" aria-label={`${c.household}: ${overview.householdName}`}><span>{c.household}</span><strong>{overview.householdName}</strong></div> : null}
      <div className="member-context__pets" role="group" aria-label={hub("petsLabel")}>
        {pets.map((p) => (
          <button key={p.id} type="button" className="member-context__pet" aria-pressed={p.id === current} aria-label={hub("show", { name: p.name })} disabled={isSwitching} onClick={() => p.id !== current && onSwitch(p.id)}>
            <Avatar name={p.name} src={p.photoUrl ?? undefined} size="sm" /><span>{p.name}</span>
          </button>
        ))}
        <Link className="member-context__add" href={`/${locale}/pets/new`}><Plus size={17} aria-hidden="true" />{hub("addPet")}</Link>
      </div>
    </div>
  <section className={`glass-home${memorial ? " glass-home--memorial" : ""}`} aria-label={c.identity}>
    <header className="glass-home__greeting">
      <div><p className="glass-home__eyebrow">{memorial ? hub("memorialEyebrow") : locale === "fa" ? "اپت لایف" : "opetlife"}</p><h2>{c.greeting}{userName ? c.nameSeparator + userName : ""}</h2><p>{memorial ? hub("memorialTitle", { name: pet.name }) : c.subtitle}</p></div>
      {memorial ? null : <div className="glass-home__summary"><Bell size={22} aria-hidden="true" /><strong>{count(overview.upcoming.length)}</strong><span>{c.reminders}</span></div>}
    </header>
    {memorial ? (
      <div className="glass-home__memorial glass-panel">
        <p>{hub("memorialBody")}</p>
        <div className="glass-home__memorial-actions">
          <Link className="opl-btn primary" href={`${base}/memories`}><Images size={18} aria-hidden="true" />{hub("openMemories", { name: pet.name })}</Link>
          <Link className="opl-btn line" href={`/${locale}/memorials`}>{hub("visitMemorial")}</Link>
        </div>
      </div>
    ) : null}
    <div className="glass-home__grid">
      <aside className="glass-home__identity glass-panel">
        <div className="glass-home__pet"><Avatar name={pet.name} src={pet.photoUrl ?? undefined} size="lg" /><div><h2>{pet.name}</h2><p>{[speciesLabel(pet, locale), pet.breed].filter(Boolean).join(" · ")} <span>{formatAge(pet, locale, "")}</span></p></div></div>
        {permission.error ? <p role="alert">{c.accessError} <button type="button" onClick={permission.retry}>{c.retry}</button></p> : null}
        <nav className="glass-home__sections" aria-label={c.profile}>{sections.map(({ href, label, Icon }) => <Link key={href} href={href}><Icon size={22} aria-hidden="true" /><span>{label}</span></Link>)}</nav>
        <section className="glass-home__attention" aria-labelledby="home-attention"><h2 id="home-attention">{c.attention}</h2>
          {overview.attention.length ? <ul>{overview.attention.slice(0, 4).map(item => <li key={item.id}><Link href={base + item.href}><span><strong>{attentionTitle(item.title, locale)}</strong>{item.dueAt ? <small>{formatOverviewDate(item.dueAt, locale)}</small> : null}</span>{item.severity !== "ATTENTION" ? <StatusLabel tone={severityTone(item.severity)}>{severityLabel(item.severity, locale)}</StatusLabel> : null}<Forward size={16} aria-hidden="true" /></Link></li>)}</ul> : <div><p>{c.noAttention}</p><p className="glass-home__hint">{c.attentionHint}</p></div>}
        </section>
      </aside>
      <section className="glass-home__calendar glass-panel" aria-labelledby="home-upcoming"><header><div><h2 id="home-upcoming">{c.calendar}</h2><p>{c.upcoming}</p></div><CalendarDays size={24} aria-hidden="true" /></header>
        {careFailed && overview.upcoming.length > 0 ? <p role="status">{c.careError} <button type="button" onClick={onRetryCare}>{c.retry}</button></p> : null}
        {overview.upcoming.length ? <ol>{overview.upcoming.slice(0, 5).map((item) => <li key={`${item.type}-${item.id}`}><Link href={item.href.startsWith("/bookings/") ? `/${locale}${item.href}` : base + item.href}><CalendarDays size={21} aria-hidden="true" /><div><strong>{eventTitle(item.title, locale)}</strong><time dateTime={item.occurredAt}>{formatOverviewDate(item.occurredAt, locale)}</time>{item.providerName ? <small>{item.providerName}</small> : null}</div><Forward size={18} aria-hidden="true" /></Link></li>)}</ol> : <div className="glass-home__empty"><p>{careFailed ? c.careError : c.empty}</p>{careFailed ? <button type="button" onClick={onRetryCare}>{c.retry}</button> : null}</div>}
        {permission.access?.canViewCareProfile ? <Link className="glass-home__calendar-link" href={`${base}/care`}>{c.calendarLink}<Forward size={18} aria-hidden="true" /></Link> : null}
      </section>
    </div>
  </section>
  </>;
}
